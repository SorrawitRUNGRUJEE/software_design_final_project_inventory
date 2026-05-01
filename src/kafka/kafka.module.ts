import { Module, forwardRef } from '@nestjs/common';
import { KafkaProducerService } from './kafka.producer';
import { KafkaConsumerService } from './kafka.consumer';
import { PropertyModule } from '../property/property.module';

@Module({
  imports: [forwardRef(() => PropertyModule)],
  providers: [KafkaProducerService, KafkaConsumerService],
  exports: [KafkaProducerService],
})
export class KafkaModule {}
