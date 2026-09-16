import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { SettingsModule } from '../settings/settings.module';

@Module({
  // O perfil precisa da lista de cadências que a redacção configura em
  // /admin/configuracoes — ver UsersService.getOwn.
  imports: [SettingsModule],
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
