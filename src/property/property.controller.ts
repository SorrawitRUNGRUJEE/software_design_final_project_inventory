import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { PropertyService } from "./property.service";
import {
  CreatePropertyDto,
  ExaminationDto,
  SettlePriceDto,
  FinalizePropertyDto,
  DefectReportDto,
} from "./dto/property.dto";

@Controller("api/v1")
export class PropertyController {
  constructor(private readonly propertyService: PropertyService) {}

  // ============================================================
  // FE LIST HELPERS — to drive the workflow steps
  // ============================================================

  /**
   * GET /api/v1/properties/surveyed
   * FE Step 1 list: properties from CEO that are awaiting inspection.
   */
  @Get("properties/surveyed")
  async getSurveyedProperties() {
    return this.propertyService.getSurveyedProperties();
  }

  /**
   * GET /api/v1/properties/bought
   * FE Step 2 list: properties whose purchase has been confirmed,
   * waiting for property details to be filled in.
   */
  @Get("properties/bought")
  async getBoughtProperties() {
    return this.propertyService.getBoughtProperties();
  }

  /**
   * GET /api/v1/properties/registered
   * FE Step 3 list: properties whose details are filled in,
   * waiting for price negotiation.
   */
  @Get("properties/registered")
  async getRegisteredProperties() {
    return this.propertyService.getRegisteredProperties();
  }

  /**
   * GET /api/v1/properties/price-settled
   * FE Step 4 list: properties whose price is settled,
   * waiting for finalization.
   */
  @Get("properties/price-settled")
  async getPriceSettledProperties() {
    return this.propertyService.getPriceSettledProperties();
  }

  // ============================================================
  // STAFF INPUT — write endpoints
  // ============================================================

  /**
   * POST /api/v1/properties/:id/examination (Row 2)
   * Submit inspection result with 4 pass/fail categories.
   * → publishes inventory.property.examined to CEO
   */
  @Post("properties/:id/examination")
  @HttpCode(HttpStatus.CREATED)
  async submitExamination(
    @Param("id") id: string,
    @Body() dto: ExaminationDto,
  ) {
    return this.propertyService.submitExamination(id, dto);
  }

  /**
   * POST /api/v1/properties (Row 4)
   * Inventory team fills in property details after purchase.
   * → publishes inventory.property.registered to Sales
   */
  @Post("properties")
  @HttpCode(HttpStatus.CREATED)
  async registerProperty(@Body() dto: CreatePropertyDto) {
    return this.propertyService.registerProperty(dto);
  }

  /**
   * PUT /api/v1/properties/:id/price (Row 5)
   * Inventory finalizes the agreed price.
   * → publishes inventory.price.settled to Marketing & CEO
   */
  @Put("properties/:id/price")
  async settlePrice(@Param("id") id: string, @Body() dto: SettlePriceDto) {
    return this.propertyService.settlePrice(id, dto);
  }

  /**
   * POST /api/v1/properties/:id/finalize (Row 6)
   * Confirms property is fully ready for sale (no new data).
   * → publishes inventory.property.finalized to Sales
   * → status becomes AVAILABLE
   */
  @Post("properties/:id/finalize")
  @HttpCode(HttpStatus.CREATED)
  async finalizeProperty(
    @Param("id") id: string,
    @Body() dto: FinalizePropertyDto,
  ) {
    return this.propertyService.finalizeProperty(id, dto);
  }

  /**
   * POST /api/v1/defects (Flow 4)
   * Receives defect report and publishes to Post-Sale.
   */
  @Post("defects")
  @HttpCode(HttpStatus.CREATED)
  async reportDefect(@Body() dto: DefectReportDto) {
    return this.propertyService.reportDefect(dto);
  }

  // ============================================================
  // GET — outbound to other teams
  // ============================================================

  @Get("properties")
  async getProperties(@Query("status") status?: string) {
    return this.propertyService.getProperties(status);
  }

  @Get("properties/:id")
  async getPropertyById(@Param("id") id: string) {
    return this.propertyService.getPropertyById(id);
  }

  @Get("properties/:id/status")
  async getPropertyStatus(@Param("id") id: string) {
    return this.propertyService.getPropertyStatus(id);
  }

  @Get("properties/:id/price")
  async getPropertyPrice(@Param("id") id: string) {
    return this.propertyService.getPropertyPrice(id);
  }

  @Get("properties/:id/inspection")
  async getPropertyInspection(@Param("id") id: string) {
    return this.propertyService.getPropertyInspection(id);
  }

  @Get("properties/:id/history")
  async getPropertyHistory(@Param("id") id: string) {
    return this.propertyService.getPropertyHistory(id);
  }

  @Get("/health")
  healthCheck() {
    return { status: "UP", service: "inventory-catalog-service" };
  }
}
