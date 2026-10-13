import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { Request } from 'express';
import { Public } from '../authorization/decorators/public.decorator';
import { CreateReviewDto, FeatureReviewDto, QueryMyReviewsDto, QueryReviewsDto } from './dto/review.dto';
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

  /** The signed-in jeweler's own reviews, whether or not the profile is published (to manage them). */
  @ApiBearerAuth()
  @Get('mine')
  findMine(@Query() query: QueryMyReviewsDto, @Req() req: AuthedRequest) {
    return this.reviews.findMine(req.user, query.page);
  }

  @ApiBearerAuth()
  @Patch(':id/feature')
  feature(@Param('id') id: string, @Body() dto: FeatureReviewDto, @Req() req: AuthedRequest) {
    return this.reviews.feature(id, dto.isFeatured, req.user);
  }
}
