import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PropertyService } from "../property/property.service";

// Confluent Kafka JavaScript client (same library as the rest of the class)
const { Kafka } = require("@confluentinc/kafka-javascript").KafkaJS;

@Injectable()
export class KafkaConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaConsumerService.name);
  private consumer: any;

  constructor(
    private configService: ConfigService,
    private propertyService: PropertyService,
  ) {}

  /**
   * Different teams send Kafka payloads in different shapes:
   *   - Single object:        { propertyId: "...", ... }
   *   - Wrapped in array:     [ { propertyId: "...", ... } ]
   *   - Wrapped under data:   { success: true, data: { propertyId: "...", ... } }
   *   - Array of items:       [ {...}, {...}, {...} ]
   *
   * This helper flattens all of those into a list of plain objects
   * we can route to a handler one at a time.
   */
  private normalizeToItems(parsed: any): any[] {
    if (Array.isArray(parsed)) {
      return parsed.filter((x) => x && typeof x === "object");
    }
    if (parsed && typeof parsed === "object") {
      // Payment team's shape: { success, data: {...}, timestamp }
      if (parsed.data && typeof parsed.data === "object") {
        return Array.isArray(parsed.data) ? parsed.data : [parsed.data];
      }
      return [parsed];
    }
    return [];
  }

  async onModuleInit() {
    const baseConfig =
      this.configService.get<Record<string, string>>("kafka.clientConfig");

    // Confluent client expects group.id and auto.offset.reset in the same flat config
    const config = {
      ...baseConfig,
      "group.id": this.configService.get<string>("kafka.consumerGroup"),
      "auto.offset.reset": this.configService.get<string>(
        "kafka.autoOffsetReset",
      ),
    };

    this.consumer = new Kafka().consumer(config);
    await this.consumer.connect();
    this.logger.log("Kafka Consumer connected to Confluent Cloud");

    const topics = this.configService.get("topics.consumed");
    const topicList = [
      topics.propertySurvey, // from CEO
      topics.propertyBought, // from Payment
      topics.secondPayment, // from Payment
      topics.quotationCreated, // from Sales
      topics.reservationCreated, // from Sales
      topics.bookingCreated, // from Sales
    ];

    await this.consumer.subscribe({ topics: topicList });
    this.logger.log(`Subscribed to topics: ${topicList.join(", ")}`);

    this.consumer.run({
      eachMessage: async ({ topic, message }) => {
        const raw = message.value?.toString() ?? "";

        if (!raw.trim()) {
          this.logger.warn(`Empty message on [${topic}], skipping`);
          return;
        }

        let parsed: any;
        try {
          parsed = JSON.parse(raw);
        } catch (err) {
          this.logger.error(
            `Bad JSON on [${topic}], skipping. ` +
              `First 200 chars: ${raw.slice(0, 200)}`,
          );
          return;
        }

        // Some producers wrap a single payload in an array, e.g. [{...}].
        // Some wrap it under a 'data' key, e.g. { success: true, data: {...} }.
        // Normalize all of these into a list of plain objects to process.
        const items = this.normalizeToItems(parsed);

        if (items.length === 0) {
          this.logger.warn(
            `No usable items in message on [${topic}], skipping`,
          );
          return;
        }

        for (const item of items) {
          this.logger.log(
            `Received message on [${topic}]: ${JSON.stringify(item)}`,
          );
          try {
            await this.route(topic, item);
          } catch (err) {
            this.logger.error(
              `Handler failed for [${topic}]: ${err instanceof Error ? err.message : err}`,
            );
          }
        }
      },
    });
  }

  async onModuleDestroy() {
    if (this.consumer) {
      await this.consumer
        .commitOffsets()
        .finally(() => this.consumer.disconnect());
    }
  }

  /**
   * Routes incoming messages to the appropriate domain handler
   */
  private async route(topic: string, data: any) {
    const topics = this.configService.get("topics.consumed");

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
        "QUOTATION_IN_PROGRESS",
        "sale.quotationcreated.complete",
        data,
      );
      return;
    }

    // Sales created a reservation
    if (topic === topics.reservationCreated) {
      await this.propertyService.updateStatus(
        data.propertyId,
        "RESERVED",
        "sale.reservationcreated.complete",
        data,
      );
      return;
    }

    // Sales confirmed booking
    if (topic === topics.bookingCreated) {
      await this.propertyService.updateStatus(
        data.propertyId,
        "BOOKED",
        "sale.booked.complete",
        data,
      );
      return;
    }

    this.logger.warn(`No handler found for topic: ${topic}`);
  }
}
