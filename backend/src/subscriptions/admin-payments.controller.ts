import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { User, UserRole } from '@prisma/client';
import { Request } from 'express';
import { Roles } from '../authorization/decorators/roles.decorator';
import { PaymentsQueryDto, RefundDto, ResolveRefundDto } from './dto/admin-payments.dto';
import { RefundsService } from './refunds.service';

type AuthedRequest = Request & { user: User };

@ApiTags('Admin')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin')
export class AdminPaymentsController {
  constructor(private readonly refunds: RefundsService) {}

  @Get('payments/invoices')
  @ApiOperation({ summary: 'Plan payments (newest first) with their refunds and what is left to refund' })
  invoices(@Query() query: PaymentsQueryDto) {
    return this.refunds.listInvoices(query);
  }

  @Post('payments/invoices/:id/refunds')
  @ApiOperation({
    summary: 'Refund a card payment of a plan through Cardcom (whole remaining amount by default)',
    description: 'Answers with the refund: SUCCEEDED, FAILED (with Cardcom\'s reason) or UNKNOWN (no answer from Cardcom: check it there, then settle it).',
  })
  refundInvoice(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RefundDto, @Req() req: AuthedRequest) {
    return this.refunds.refundInvoice(req.user, id, dto);
  }

  @Get('payments/review')
  @ApiOperation({ summary: 'Payments kept for review (money that could not be applied safely): newest first' })
  review() {
    return this.refunds.reviewItems();
  }

  @Post('refunds/:id/resolve')
  @ApiOperation({ summary: 'Settle a refund of unknown outcome after checking it in the Cardcom panel' })
  resolve(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ResolveRefundDto, @Req() req: AuthedRequest) {
    return this.refunds.resolve(req.user, id, dto.outcome);
  }
}
