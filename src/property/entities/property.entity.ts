import {
  Entity,
  Column,
  PrimaryColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum PropertyStatus {
  SURVEYED = 'SURVEYED',                   // After Row 1: ceo.property.surveyed
  EXAMINED = 'EXAMINED',                   // After Row 2: examination submitted
  BOUGHT = 'BOUGHT',                       // After Row 3: payment.propertybought.completed
  REGISTERED = 'REGISTERED',               // After Row 4: details filled in
  PRICE_SETTLED = 'PRICE_SETTLED',         // After Row 5: price negotiated
  AVAILABLE = 'AVAILABLE',                 // After Row 6: finalized & saved → ready to sell
  QUOTATION_IN_PROGRESS = 'QUOTATION_IN_PROGRESS',
  RESERVED = 'RESERVED',
  BOOKED = 'BOOKED',
  SOLD = 'SOLD',
}

@Entity('properties')
export class Property {
  @PrimaryColumn()
  propertyId: string;

  // ============================================
  // Status tracking
  // ============================================
  @Column({
    type: 'enum',
    enum: PropertyStatus,
    default: PropertyStatus.SURVEYED,
  })
  status: PropertyStatus;

  // ============================================
  // Survey data (Row 1 — from CEO)
  // ============================================
  @Column({ nullable: true })
  surveyedAt: string;

  // ============================================
  // Inspection data (Row 2 — examination)
  // ============================================
  @Column({ type: 'boolean', nullable: true })
  structurePassed: boolean;

  @Column({ type: 'boolean', nullable: true })
  waterAndRoofPassed: boolean;

  @Column({ type: 'boolean', nullable: true })
  electricityPassed: boolean;

  @Column({ type: 'boolean', nullable: true })
  generalConditionPassed: boolean;

  @Column({ nullable: true })
  inspectedBy: string;

  @Column({ nullable: true })
  inspectedAt: string;

  @Column({ nullable: true })
  inspectionRemarks: string;

  // ============================================
  // Purchase data (Row 3 — from Payment)
  // ============================================
  @Column({ type: 'float', nullable: true })
  purchasePrice: number;

  @Column({ nullable: true })
  purchaseDate: string;

  // ============================================
  // Property details (Row 4 — Basic Identification)
  // ============================================
  @Column({ nullable: true })
  propertyName: string;

  @Column({ nullable: true })
  unitNumber: string;

  @Column({ nullable: true })
  fullAddress: string;

  @Column({ nullable: true })
  propertyType: string;

  // --- Sale Preparation ---
  @Column({ type: 'float', nullable: true })
  originalPurchasePrice: number;

  @Column({ type: 'float', nullable: true })
  targetSellingPrice: number;

  @Column({ nullable: true })
  propertyCondition: string;

  // --- Current Inventory Details ---
  @Column({ type: 'float', nullable: true })
  totalSquareFootage: number;

  @Column({ type: 'int', nullable: true })
  roomCount: number;

  @Column({ nullable: true })
  registeredBy: string;

  @Column({ nullable: true })
  registeredAt: string;

  // ============================================
  // Price Negotiation (Row 5)
  // ============================================
  @Column({ type: 'float', nullable: true })
  agreedPrice: number;

  @Column({ nullable: true })
  currency: string;

  @Column({ nullable: true })
  priceSettledBy: string;

  @Column({ nullable: true })
  priceSettledAt: string;

  // ============================================
  // Finalize (Row 6)
  // ============================================
  @Column({ nullable: true })
  finalizedBy: string;

  @Column({ nullable: true })
  finalizedAt: string;

  // ============================================
  // Audit
  // ============================================
  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
