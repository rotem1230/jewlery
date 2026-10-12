import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { Request } from 'express';
import { CreateQuoteDto, DeclineQuoteDto, UpdateQuoteDto } from './dto/quote.dto';
import { QuotesService } from './quotes.service';

type AuthedRequest = Request & { user: User };

@ApiTags('Quotes')
@ApiBearerAuth()
@Controller('quotes')
export class QuotesController {
  constructor(private readonly quotes: QuotesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a quote', description: 'Server computes totalPrice = materialsCost + laborCost and snapshots the latest published quote_disclaimer content page.' })
  create(@Body() dto: CreateQuoteDto, @Req() req: AuthedRequest) {
    return this.quotes.create(req.user, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a quote with the snapshotted disclaimer body' })
  findOne(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.quotes.findOne(id, req.user);
  }

  @Post(':id/accept')
  @ApiOperation({
    summary: 'Accept a quote (idempotent)',
    description:
      'Runs in a single database transaction: marks quote ACCEPTED, completes the Design, auto-declines other ' +
      'PENDING quotes on the design, and posts SYSTEM handoff messages with a WhatsApp deep link.',
  })
  accept(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.quotes.accept(id, req.user);
  }

  @Post(':id/decline')
  @ApiOperation({ summary: 'Decline a quote (idempotent)' })
  decline(@Param('id') id: string, @Body() dto: DeclineQuoteDto, @Req() req: AuthedRequest) {
    return this.quotes.decline(id, req.user, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit a quote (only while PENDING)' })
  update(@Param('id') id: string, @Body() dto: UpdateQuoteDto, @Req() req: AuthedRequest) {
    return this.quotes.update(id, req.user, dto);
  }
}
