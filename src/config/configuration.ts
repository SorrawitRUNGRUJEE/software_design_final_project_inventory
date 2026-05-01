import * as fs from 'fs';
import * as path from 'path';

/**
 * Reads client.properties file (Confluent Cloud connection details).
 * Returns a flat object that the Kafka client expects.
 */
function readClientProperties(): Record<string, string> {
  const filePath = path.join(process.cwd(), 'client.properties');

  if (!fs.existsSync(filePath)) {
    console.warn('client.properties not found at project root. Kafka will not work until you add it.');
    return {};
  }

  const content = fs.readFileSync(filePath, 'utf8');
  return content
    .split('\n')
    .reduce<Record<string, string>>((acc, line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return acc;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) return acc;
      const key = trimmed.slice(0, eqIndex).trim();
      const value = trimmed.slice(eqIndex + 1).trim();
      if (key && value) acc[key] = value;
      return acc;
    }, {});
}

export default () => ({
  port: parseInt(process.env.PORT, 10) || 3000,

  database: {
    host: process.env.DATABASE_HOST,
    port: parseInt(process.env.DATABASE_PORT, 10) || 5432,
    username: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    name: process.env.DATABASE_NAME,
    ssl: process.env.DATABASE_SSL === 'true',
  },

  kafka: {
    // Confluent Cloud connection comes from client.properties
    clientConfig: readClientProperties(),
    consumerGroup: process.env.KAFKA_CONSUMER_GROUP || 'inventory-catalog-group',
    autoOffsetReset: process.env.KAFKA_AUTO_OFFSET_RESET || 'earliest',
  },

  topics: {
    // Topics PUBLISHED by Inventory
    published: {
      propertyExamined: process.env.TOPIC_PROPERTY_EXAMINED || 'inventory.property.examined',
      priceSettled: process.env.TOPIC_PRICE_SETTLED || 'inventory.price.settled',
      propertyRegistered: process.env.TOPIC_PROPERTY_REGISTERED || 'inventory.property.registered',
      propertyFinalized: process.env.TOPIC_PROPERTY_FINALIZED || 'inventory.property.finalized',
      defectReportReceived: process.env.TOPIC_DEFECT_REPORT_RECEIVED || 'inventory.defect.received',
    },
    // Topics CONSUMED from other teams
    consumed: {
      propertySurvey: process.env.TOPIC_PROPERTY_SURVEY || 'ceo.property.surveyed',
      propertyBought: process.env.TOPIC_PROPERTY_BOUGHT || 'payment.propertybought.completed',
      secondPayment: process.env.TOPIC_SECOND_PAYMENT || 'payment.secondpayment.completed',
      quotationCreated: process.env.TOPIC_QUOTATION_CREATED || 'sale.quotationcreated.complete',
      reservationCreated: process.env.TOPIC_RESERVATION_CREATED || 'sale.reservationcreated.complete',
      bookingCreated: process.env.TOPIC_BOOKING_CREATED || 'sale.booked.complete',
    },
  },
});
