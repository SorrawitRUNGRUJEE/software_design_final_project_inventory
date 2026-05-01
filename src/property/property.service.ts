import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Property, PropertyStatus } from './entities/property.entity';
import { PropertyHistory } from './entities/property-history.entity';
import { KafkaProducerService } from '../kafka/kafka.producer';
import {
  CreatePropertyDto,
  ExaminationDto,
  SettlePriceDto,
  FinalizePropertyDto,
  DefectReportDto,
} from './dto/property.dto';

@Injectable()
export class PropertyService {
  private readonly logger = new Logger(PropertyService.name);

  constructor(
    @InjectRepository(Property)
    private propertyRepo: Repository<Property>,

    @InjectRepository(PropertyHistory)
    private historyRepo: Repository<PropertyHistory>,

    private kafkaProducer: KafkaProducerService,
  ) {}

  // ============================================================
  // STAFF INPUT ENDPOINTS — match the FE workflow steps
  // ============================================================

  /**
   * Step 1 (Inspection list helper) — GET surveyed properties
   * Used by FE to populate the Step 1 list
   */
  async getSurveyedProperties() {
    const properties = await this.propertyRepo.find({
      where: { status: PropertyStatus.SURVEYED },
    });
    return {
      properties: properties.map((p) => ({
        propertyId: p.propertyId,
        propertyName: p.propertyName || p.propertyId,
        address: p.fullAddress,
      })),
    };
  }

  /**
   * Step 2 (Row 2) — POST /api/v1/properties/:id/examination
   * Inventory & Legal submit inspection result with 4 pass/fail categories.
   * Publishes inventory.property.examined → CEO
   */
  async submitExamination(propertyId: string, dto: ExaminationDto) {
    const property = await this.findOrFail(propertyId);

    property.structurePassed = dto.structurePassed;
    property.waterAndRoofPassed = dto.waterAndRoofPassed;
    property.electricityPassed = dto.electricityPassed;
    property.generalConditionPassed = dto.generalConditionPassed;
    property.inspectedBy = dto.inspectedBy;
    property.inspectedAt = new Date().toISOString();
    property.inspectionRemarks = dto.remarks;
    property.status = PropertyStatus.EXAMINED;

    await this.propertyRepo.save(property);

    const allPassed =
      dto.structurePassed &&
      dto.waterAndRoofPassed &&
      dto.electricityPassed &&
      dto.generalConditionPassed;

    await this.recordHistory(
      propertyId,
      'inventory.property.examined',
      'EXAMINED',
      dto.inspectedBy,
      `Overall: ${allPassed ? 'PASSED' : 'NOT PASSED'} | ${dto.remarks ?? ''}`,
    );

    await this.kafkaProducer.publishPropertyExamined({
      propertyId,
      structurePassed: dto.structurePassed,
      waterAndRoofPassed: dto.waterAndRoofPassed,
      electricityPassed: dto.electricityPassed,
      generalConditionPassed: dto.generalConditionPassed,
      overallPassed: allPassed,
      inspectedBy: dto.inspectedBy,
      inspectedAt: property.inspectedAt,
      remarks: dto.remarks,
    });

    this.logger.log(`Examination submitted for: ${propertyId}`);
    return { message: 'Examination result submitted', propertyId };
  }

  /**
   * Step 3 (Property Details list helper) — GET bought properties
   */
  async getBoughtProperties() {
    const properties = await this.propertyRepo.find({
      where: { status: PropertyStatus.BOUGHT },
    });
    return {
      properties: properties.map((p) => ({
        propertyId: p.propertyId,
        propertyName: p.propertyName || p.propertyId,
        address: p.fullAddress,
      })),
    };
  }

  /**
   * Step 4 (Row 4) — POST /api/v1/properties
   * Inventory team fills in property details after purchase.
   * Publishes inventory.property.registered → Sales
   */
  async registerProperty(dto: CreatePropertyDto) {
    let property = await this.propertyRepo.findOne({
      where: { propertyId: dto.propertyId },
    });

    if (!property) {
      property = this.propertyRepo.create({ propertyId: dto.propertyId });
    }

    // Basic Identification
    property.propertyName = dto.propertyName;
    property.unitNumber = dto.unitNumber;
    property.fullAddress = dto.fullAddress;
    property.propertyType = dto.propertyType;

    // Sale Preparation
    property.originalPurchasePrice = dto.originalPurchasePrice;
    property.targetSellingPrice = dto.targetSellingPrice;
    property.propertyCondition = dto.propertyCondition;

    // Current Inventory Details
    property.totalSquareFootage = dto.totalSquareFootage;
    property.roomCount = dto.roomCount;

    property.registeredBy = dto.registeredBy;
    property.registeredAt = new Date().toISOString();
    property.status = PropertyStatus.REGISTERED;

    await this.propertyRepo.save(property);

    await this.recordHistory(
      property.propertyId,
      'inventory.property.registered',
      'REGISTERED',
      dto.registeredBy,
    );

    await this.kafkaProducer.publishPropertyRegistered({
      propertyId: property.propertyId,
      propertyName: property.propertyName,
      fullAddress: property.fullAddress,
      propertyType: property.propertyType,
      targetSellingPrice: property.targetSellingPrice,
      status: property.status,
      registeredAt: property.registeredAt,
    });

    this.logger.log(`Property registered: ${property.propertyId}`);
    return {
      message: 'Property details registered successfully',
      propertyId: property.propertyId,
    };
  }

  /**
   * Step 5 (Price Negotiation list helper) — GET registered properties
   */
  async getRegisteredProperties() {
    const properties = await this.propertyRepo.find({
      where: { status: PropertyStatus.REGISTERED },
    });
    return {
      properties: properties.map((p) => ({
        propertyId: p.propertyId,
        propertyName: p.propertyName,
        address: p.fullAddress,
      })),
    };
  }

  /**
   * Step 5 (Row 5) — PUT /api/v1/properties/:id/price
   * Inventory finalizes the agreed price.
   * Publishes inventory.price.settled → Marketing, CEO
   */
  async settlePrice(propertyId: string, dto: SettlePriceDto) {
    const property = await this.findOrFail(propertyId);

    property.agreedPrice = dto.agreedPrice;
    property.currency = dto.currency || 'THB';
    property.priceSettledBy = dto.settledBy;
    property.priceSettledAt = new Date().toISOString();
    property.status = PropertyStatus.PRICE_SETTLED;

    await this.propertyRepo.save(property);

    await this.recordHistory(
      propertyId,
      'inventory.price.settled',
      'PRICE_SETTLED',
      dto.settledBy,
      `Agreed Price: ${dto.agreedPrice} ${property.currency}`,
    );

    await this.kafkaProducer.publishPriceSettled({
      propertyId,
      settledPrice: dto.agreedPrice,
      currency: property.currency,
      settledBy: dto.settledBy,
      settledAt: property.priceSettledAt,
    });

    this.logger.log(`Price settled for: ${propertyId}`);
    return {
      message: 'Price settled successfully',
      propertyId,
      agreedPrice: dto.agreedPrice,
    };
  }

  /**
   * Step 6 (Finalize list helper) — GET price-settled properties
   */
  async getPriceSettledProperties() {
    const properties = await this.propertyRepo.find({
      where: { status: PropertyStatus.PRICE_SETTLED },
    });
    return {
      properties: properties.map((p) => ({
        propertyId: p.propertyId,
        propertyName: p.propertyName,
        agreedPrice: p.agreedPrice,
        currency: p.currency,
      })),
    };
  }

  /**
   * Step 6 (Row 6) — POST /api/v1/properties/:id/finalize
   * Inventory team confirms the finished process. No new data entered.
   * Publishes inventory.property.finalized → Sales
   * Property becomes AVAILABLE for selling.
   */
  async finalizeProperty(propertyId: string, dto: FinalizePropertyDto) {
    const property = await this.findOrFail(propertyId);

    if (property.status !== PropertyStatus.PRICE_SETTLED) {
      this.logger.warn(
        `Finalize called for property in status ${property.status}: ${propertyId}`,
      );
    }

    property.finalizedBy = dto.confirmedBy;
    property.finalizedAt = new Date().toISOString();
    property.status = PropertyStatus.AVAILABLE;

    await this.propertyRepo.save(property);

    await this.recordHistory(
      propertyId,
      'inventory.property.finalized',
      'AVAILABLE',
      dto.confirmedBy,
    );

    await this.kafkaProducer.publishPropertyFinalized({
      propertyId,
      finalizedBy: dto.confirmedBy,
      finalizedAt: property.finalizedAt,
      agreedPrice: property.agreedPrice,
      currency: property.currency,
    });

    this.logger.log(`Property finalized & available: ${propertyId}`);
    return {
      message: 'Property finalized and available for sale',
      propertyId,
    };
  }

  /**
   * POST /api/v1/defects
   * Receives a defect report from staff/customer.
   * Publishes inventory.defect.received → Post-Sale
   */
  async reportDefect(dto: DefectReportDto) {
    const property = await this.findOrFail(dto.propertyId);

    const defectId = uuidv4();
    const reportedAt = new Date().toISOString();

    await this.recordHistory(
      property.propertyId,
      'inventory.defect.received',
      null,
      dto.customerId,
      `Defect ${defectId}: ${dto.description}`,
    );

    await this.kafkaProducer.publishDefectReportReceived({
      defectId,
      propertyId: dto.propertyId,
      customerId: dto.customerId,
      description: dto.description,
      reportedAt,
    });

    this.logger.log(`Defect report: ${defectId} for property ${dto.propertyId}`);
    return {
      message: 'Defect report received',
      defectId,
      propertyId: dto.propertyId,
      reportedAt,
    };
  }

  // ============================================================
  // GET ENDPOINTS — outbound to other teams
  // ============================================================

  async getProperties(status?: string) {
    const query = this.propertyRepo.createQueryBuilder('p');
    if (status) {
      query.where('p.status = :status', { status: status.toUpperCase() });
    }

    const properties = await query.getMany();
    return {
      properties: properties.map((p) => ({
        propertyId: p.propertyId,
        propertyName: p.propertyName,
        fullAddress: p.fullAddress,
        propertyType: p.propertyType,
        status: p.status,
        agreedPrice: p.agreedPrice,
        updatedAt: p.updatedAt,
      })),
    };
  }

  async getPropertyById(propertyId: string) {
    return this.findOrFail(propertyId);
  }

  async getPropertyStatus(propertyId: string) {
    const property = await this.findOrFail(propertyId);
    return {
      propertyId: property.propertyId,
      status: property.status,
      updatedAt: property.updatedAt,
    };
  }

  async getPropertyPrice(propertyId: string) {
    const property = await this.findOrFail(propertyId);
    return {
      propertyId: property.propertyId,
      agreedPrice: property.agreedPrice,
      currency: property.currency,
    };
  }

  async getPropertyInspection(propertyId: string) {
    const property = await this.findOrFail(propertyId);
    return {
      propertyId: property.propertyId,
      structurePassed: property.structurePassed,
      waterAndRoofPassed: property.waterAndRoofPassed,
      electricityPassed: property.electricityPassed,
      generalConditionPassed: property.generalConditionPassed,
      inspectedBy: property.inspectedBy,
      inspectedAt: property.inspectedAt,
      remarks: property.inspectionRemarks,
    };
  }

  async getPropertyHistory(propertyId: string) {
    await this.findOrFail(propertyId);
    const history = await this.historyRepo.find({
      where: { propertyId },
      order: { date: 'ASC' },
    });

    return {
      propertyId,
      events: history.map((h) => ({
        event: h.event,
        status: h.status,
        performedBy: h.performedBy,
        remarks: h.remarks,
        date: h.date,
      })),
    };
  }

  // ============================================================
  // KAFKA CONSUMER HANDLERS — from other teams
  // ============================================================

  /**
   * From CEO: ceo.property.surveyed (Row 1)
   * Records initial property survey data → status SURVEYED
   */
  async handlePropertySurvey(data: any) {
    this.logger.log(`Survey from CEO: ${JSON.stringify(data)}`);

    const propertyId = data.propertyId || data.property_id;
    if (!propertyId) {
      this.logger.warn('No propertyId in survey payload');
      return;
    }

    const existing = await this.propertyRepo.findOne({ where: { propertyId } });
    const property = existing || this.propertyRepo.create({ propertyId });

    property.propertyName = data.propertyName || property.propertyName;
    property.fullAddress = data.address || data.fullAddress || property.fullAddress;
    property.propertyType = data.type || data.propertyType || property.propertyType;
    property.surveyedAt = new Date().toISOString();
    property.status = PropertyStatus.SURVEYED;

    await this.propertyRepo.save(property);

    await this.recordHistory(
      propertyId,
      'ceo.property.surveyed',
      'SURVEYED',
      'ceo-service',
      'Initial survey received',
    );
  }

  /**
   * From Payment: payment.propertybought.completed (Row 3)
   * Records purchase confirmation → status BOUGHT
   */
  async handlePropertyBought(data: any) {
    this.logger.log(`Property bought event: ${JSON.stringify(data)}`);

    const payload = data.data || data;
    const propertyId = payload.propertyId;
    if (!propertyId) {
      this.logger.warn('No propertyId in property.bought payload');
      return;
    }

    const existing = await this.propertyRepo.findOne({ where: { propertyId } });
    const property = existing || this.propertyRepo.create({ propertyId });

    property.purchasePrice = payload.amount || payload.purchasePrice;
    property.purchaseDate = payload.acquiredAt || payload.purchaseDate || new Date().toISOString();
    property.status = PropertyStatus.BOUGHT;

    await this.propertyRepo.save(property);

    await this.recordHistory(
      propertyId,
      'payment.propertybought.completed',
      'BOUGHT',
      'payment-service',
    );
  }

  /**
   * From Payment: payment.secondpayment.completed
   * Marks property as SOLD
   */
  async handleSecondPayment(data: any) {
    this.logger.log(`Second payment event: ${JSON.stringify(data)}`);

    const payload = data.data || data;
    const propertyId = payload.propertyId;
    if (!propertyId) return;

    const property = await this.propertyRepo.findOne({ where: { propertyId } });
    if (!property) {
      this.logger.warn(`Property not found for second payment: ${propertyId}`);
      return;
    }

    property.status = PropertyStatus.SOLD;
    await this.propertyRepo.save(property);

    await this.recordHistory(
      propertyId,
      'payment.secondpayment.completed',
      'SOLD',
      'payment-service',
    );
  }

  /**
   * Generic status updater for sale events (quotation, reservation, booking)
   */
  async updateStatus(propertyId: string, status: string, event: string, data: any) {
    const property = await this.propertyRepo.findOne({ where: { propertyId } });
    if (!property) {
      this.logger.warn(`Property not found for status update: ${propertyId}`);
      return;
    }

    property.status = status as PropertyStatus;
    await this.propertyRepo.save(property);

    await this.recordHistory(propertyId, event, status, 'sales-service');
  }

  // ============================================================
  // HELPERS
  // ============================================================

  private async findOrFail(propertyId: string): Promise<Property> {
    const property = await this.propertyRepo.findOne({ where: { propertyId } });
    if (!property) {
      throw new NotFoundException(`Property not found: ${propertyId}`);
    }
    return property;
  }

  private async recordHistory(
    propertyId: string,
    event: string,
    status?: string,
    performedBy?: string,
    remarks?: string,
  ) {
    const record = this.historyRepo.create({
      propertyId,
      event,
      status,
      performedBy,
      remarks,
    });
    await this.historyRepo.save(record);
  }
}
