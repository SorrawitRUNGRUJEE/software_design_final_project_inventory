import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PropertyService } from '../property/property.service';

// Confluent Kafka JavaScript client (same library as the rest of the class)
const { Kafka } = require('@confluentinc/kafka-javascript').KafkaJS;

@Injectable()
export class KafkaConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaConsumerService.name);
  private consumer: any;

  constructor(
    private configService: ConfigService,
    private propertyService: PropertyService,
  ) {}

  async onModuleInit() {
    const baseConfig = this.configService.get<Record<string, string>>('kafka.clientConfig');

    // Confluent client expects group.id and auto.offset.reset in the same flat config
    const config = {
      ...baseConfig,
      'group.id': this.configService.get<string>('kafka.consumerGroup'),
      'auto.offset.reset': this.configService.get<string>('kafka.autoOffsetReset'),
    };

    this.consumer = new Kafka().consumer(config);
    await this.consumer.connect();
    this.logger.log('Kafka Consumer connected to Confluent Cloud');

    const topics = this.configService.get('topics.consumed');
    const topicList = [
      topics.propertySurvey,       // from CEO
      topics.propertyBought,       // from Payment
      topics.secondPayment,        // from Payment
      topics.quotationCreated,     // from Sales
      topics.reservationCreated,   // from Sales
      topics.bookingCreated,       // from Sales
    ];

    await this.consumer.subscribe({ topics: topicList });
    this.logger.log(`Subscribed to topics: ${topicList.join(', ')}`);

    this.consumer.run({
      eachMessage: async ({ topic, message }) => {
        const data = JSON.parse(message.value.toString());
        this.logger.log(`Received message on [${topic}]: ${JSON.stringify(data)}`);
        await this.route(topic, data);
      },
    });
  }

  async onModuleDestroy() {
    if (this.consumer) {
      await this.consumer.commitOffsets().finally(() => this.consumer.disconnect());
    }
  }

  /**
   * Routes incoming messages to the appropriate domain handler
   */
  private async route(topic: string, data: any) {
    const topics = this.configService.get('topics.consumed');

    // CEO sends initial property survey
    if (topic === topics.propertySurvey) {
      await this.propertyService.handlePropertySurvey(data);
      return;
    }

    // Payment confirms property purchase
    if (topic === topics.propertyBought) {
      await this.propertyService.handlePropertyBought(data);
      return;
    }

    // Payment confirms second payment
    if (topic === topics.secondPayment) {
      await this.propertyService.handleSecondPayment(data);
      return;
    }

    // Sales created a quotation
    if (topic === topics.quotationCreated) {
      await this.propertyService.updateStatus(
        data.propertyId,
        'QUOTATION_IN_PROGRESS',
        'sale.quotationcreated.complete',
        data,
      );
      return;
    }

    // Sales created a reservation
    if (topic === topics.reservationCreated) {
      await this.propertyService.updateStatus(
        data.propertyId,
        'RESERVED',
        'sale.reservationcreated.complete',
        data,
      );
      return;
    }

    // Sales confirmed booking
    if (topic === topics.bookingCreated) {
      await this.propertyService.updateStatus(
        data.propertyId,
        'BOOKED',
        'sale.booked.complete',
        data,
      );
      return;
    }

    this.logger.warn(`No handler found for topic: ${topic}`);
  }
}
