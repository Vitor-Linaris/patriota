import { Module } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CategoriesController } from './categories.controller';
import { CategoryTreeService } from './category-tree.service';
import { StaffNotificationsModule } from '../staff-notifications/staff-notifications.module';

@Module({
  imports: [StaffNotificationsModule],
  providers: [CategoriesService, CategoryTreeService],
  controllers: [CategoriesController],
  exports: [CategoriesService, CategoryTreeService],
})
export class CategoriesModule {}
