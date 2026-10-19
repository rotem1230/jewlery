import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { User, UserRole } from '@prisma/client';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Request } from 'express';
import { Roles } from '../authorization/decorators/roles.decorator';
import { PaymentsQueryDto, RefundDto } from '../subscriptions/dto/admin-payments.dto';
import { RefundsService } from '../subscriptions/refunds.service';
import { JewelryPaymentsService } from './jewelry-payments.service';

type AuthedRequest = Request & { user: User };

export class PayoutsQueryDto {
  @ApiPropertyOptional({ enum: ['OWED', 'PAID', 'CANCELLED'] })
  @IsOptional()
  @IsIn(['OWED', 'PAID', 'CANCELLED'])
  status?: string;
}

export class MarkPayoutPaidDto {
  @ApiProperty({ description: 'The transfer reference (bank transfer number, etc.)' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  reference!: string;
}

@ApiTags('Admin')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin')
export class AdminJewelryPaymentsController {
  constructor(
    private readonly jewelry: JewelryPaymentsService,
    private readonly refunds: RefundsService,
  ) {}

  @Get('jewelry-payments')
  @ApiOperation({ summary: 'Jewelry payments taken by card, with their refunds and what is left to refund' })
  payments(@Query() query: PaymentsQueryDto) {
    return this.jewelry.listForAdmin(query);
  }

  @Post('jewelry-payments/:id/refunds')
  @ApiOperation({ summary: 'Refund a jewelry payment through Cardcom (taken off what the jeweler is owed)' })
  refund(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RefundDto, @Req() req: AuthedRequest) {
    return this.refunds.refundJewelry(req.user, id, dto);
  }

  @Get('jewelry-payouts')
  @ApiOperation({ summary: 'What is owed to jewelers (OWED), was transferred (PAID) or cancelled' })
  payouts(@Query() query: PayoutsQueryDto) {
    return this.jewelry.listPayouts(query);
  }

  @Post('jewelry-payouts/:id/mark-paid')
  @ApiOperation({ summary: 'Record that what was owed was transferred to the jeweler' })
  markPaid(@Param('id', ParseUUIDPipe) id: string, @Body() dto: MarkPayoutPaidDto, @Req() req: AuthedRequest) {
    return this.jewelry.markPayoutPaid(req.user, id, dto.reference);
  }
}
