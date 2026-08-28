import { Module } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CategoriesController } from './categories.controller';
import { CategoryTreeService } from './category-tree.service';

@Module({
  providers: [CategoriesService, CategoryTreeService],
  controllers: [CategoriesController],
  exports: [CategoriesService, CategoryTreeService],
})
export class CategoriesModule {}
