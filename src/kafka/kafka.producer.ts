import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Confluent Kafka JavaScript client (matches what the team's setup uses)
const { Kafka } = require('@confluentinc/kafka-javascript').KafkaJS;

@Injectable()
export class KafkaProducerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaProducerService.name);
  private producer: any;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    const config = this.configService.get<Record<string, string>>('kafka.clientConfig');
    this.producer = new Kafka().producer(config);
    await this.producer.connect();
    this.logger.log('Kafka Producer connected to Confluent Cloud');
  }

  async onModuleDestroy() {
    if (this.producer) {
      await this.producer.disconnect();
    }
  }

  /**
   * Publishes inventory.property.examined event to Kafka
   * Consumers: CEO
   */
  async publishPropertyExamined(payload: {
    propertyId: string;
    structurePassed: boolean;
    waterAndRoofPassed: boolean;
    electricityPassed: boolean;
    generalConditionPassed: boolean;
    overallPassed: boolean;
    inspectedBy: string;
    inspectedAt: string;
    remarks?: string;
  }) {
    const topic = this.configService.get<string>('topics.published.propertyExamined');
    await this.publish(topic, payload);
    this.logger.log(`Published [${topic}] for property: ${payload.propertyId}`);
  }

  /**
   * Publishes inventory.price.settled event to Kafka
   * Consumers: Marketing, CEO
   */
  async publishPriceSettled(payload: {
    propertyId: string;
    settledPrice: number;
    currency: string;
    settledBy: string;
    settledAt: string;
  }) {
    const topic = this.configService.get<string>('topics.published.priceSettled');
    await this.publish(topic, payload);
    this.logger.log(`Published [${topic}] for property: ${payload.propertyId}`);
  }

  /**
   * Publishes inventory.property.registered event to Kafka
   * (= "the property has been saved into the system" — Step 4 Property Details)
   * Consumers: Sales
   */
  async publishPropertyRegistered(payload: {
    propertyId: string;
    propertyName: string;
    fullAddress: string;
    propertyType: string;
    targetSellingPrice: number;
    status: string;
    registeredAt: string;
  }) {
    const topic = this.configService.get<string>('topics.published.propertyRegistered');
    await this.publish(topic, payload);
    this.logger.log(`Published [${topic}] for property: ${payload.propertyId}`);
  }

  /**
   * Publishes inventory.property.finalized event to Kafka
   * (Step 6 — Finalize & Submit)
   * Consumers: Sales
   */
  async publishPropertyFinalized(payload: {
    propertyId: string;
    finalizedBy: string;
    finalizedAt: string;
    agreedPrice: number;
    currency: string;
  }) {
    const topic = this.configService.get<string>('topics.published.propertyFinalized');
    await this.publish(topic, payload);
    this.logger.log(`Published [${topic}] for property: ${payload.propertyId}`);
  }

  /**
   * Publishes inventory.defect.received event to Kafka
   * Consumers: Post-Sale
   */
  async publishDefectReportReceived(payload: {
    defectId: string;
    propertyId: string;
    customerId: string;
    description: string;
    reportedAt: string;
  }) {
    const topic = this.configService.get<string>('topics.published.defectReportReceived');
    await this.publish(topic, payload);
    this.logger.log(`Published [${topic}] for defect: ${payload.defectId}`);
  }

  private async publish(topic: string, payload: object) {
    const key = (payload as any).propertyId || (payload as any).defectId || 'no-key';
    await this.producer.send({
      topic,
      messages: [
        {
          key,
          value: JSON.stringify(payload),
        },
      ],
    });
  }
}
