import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { Request } from 'express';
import { Public } from '../authorization/decorators/public.decorator';
import { CreateReviewDto, FeatureReviewDto, QueryReviewsDto } from './dto/review.dto';
import { ReviewsService } from './reviews.service';

type AuthedRequest = Request & { user: User };

@ApiTags('Reviews')
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @ApiBearerAuth()
  @Post()
  create(@Body() dto: CreateReviewDto, @Req() req: AuthedRequest) {
    return this.reviews.create(req.user, dto);
  }

  @Public()
  @Get()
  findMany(@Query() query: QueryReviewsDto) {
    return this.reviews.findMany(query);
  }

  @ApiBearerAuth()
  @Patch(':id/feature')
  feature(@Param('id') id: string, @Body() dto: FeatureReviewDto, @Req() req: AuthedRequest) {
    return this.reviews.feature(id, dto.isFeatured, req.user);
  }
}
