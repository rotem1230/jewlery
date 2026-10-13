import { Controller, Get, HttpStatus, Param, ParseUUIDPipe, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { Request } from 'express';
import { QuotesService } from './quotes.service';

type AuthedRequest = Request & { user: User };

@ApiTags('Quotes')
@ApiBearerAuth()
@Controller('designs')
export class DesignQuotesController {
  constructor(private readonly quotes: QuotesService) {}

  @Get(':id/quotes')
  @ApiOperation({
    summary: 'Every quote a design received, newest first (design owner only)',
    description: 'A pending quote past its validity is listed as EXPIRED.',
  })
  list(@Param('id', new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND })) id: string, @Req() req: AuthedRequest) {
    return this.quotes.listForDesign(id, req.user);
  }
}
