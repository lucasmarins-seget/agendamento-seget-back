import { Controller, Get, Post, Body, Param, Delete, UseGuards, Request, Query, ParseUUIDPipe, Put } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { CreateBlockDto } from './dto/create-block.dto';
import { UpdateComputersDto } from './dto/update-computers.dto';

@UseGuards(JwtAuthGuard)
@Controller('admin/settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Post('blocks')
  createBlock(@Body() createBlockDto: CreateBlockDto, @Request() req){
    return this.settingsService.createBlock(createBlockDto, req.user);
  }

  @Get('blocks')
  findBlocks(@Query('room') room: string) {
    return this.settingsService.findBlocks(room);
  }

  @Delete('blocks/:id')
  removeBlock(@Param('id', ParseUUIDPipe) id: string) {
    return this.settingsService.removeBlock(id);
  }

  @Get('computers')
  getComputers() {
    return this.settingsService.getComputers();
  }

  @Put('computers')
  updateComputers(@Body() updateComputersDto: UpdateComputersDto) {
    return this.settingsService.updateComputers(updateComputersDto);
  }
}
