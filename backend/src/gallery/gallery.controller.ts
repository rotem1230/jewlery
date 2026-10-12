import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../authorization/decorators/public.decorator';
import { GalleryService } from './gallery.service';

@ApiTags('Gallery')
@Public()
@Controller('gallery')
export class GalleryController {
  constructor(private readonly gallery: GalleryService) {}

  @Get()
  list() {
    return this.gallery.list();
  }
}
