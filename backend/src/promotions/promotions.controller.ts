import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../authorization/decorators/public.decorator';
import { QueryPromotionsFeedDto } from './dto/promotion.dto';
import { PromotionsService } from './promotions.service';

@ApiTags('Promotions')
@Public()
@Controller('promotions')
export class PromotionsController {
  constructor(private readonly promotions: PromotionsService) {}

  @Get('feed')
  @ApiOperation({
    summary: 'List active sponsored promotions for a placement',
    description: 'Every item is a paid/perk placement, so each entry always carries sponsored: true.',
  })
  feed(@Query() query: QueryPromotionsFeedDto) {
    return this.promotions.feed(query.placement);
  }
}
