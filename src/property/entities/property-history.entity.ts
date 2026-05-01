import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';

@Entity('property_history')
export class PropertyHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  propertyId: string;

  @Column()
  event: string;

  @Column({ nullable: true })
  status: string;

  @Column({ nullable: true })
  performedBy: string;

  @Column({ nullable: true })
  remarks: string;

  @CreateDateColumn()
  date: Date;
}
