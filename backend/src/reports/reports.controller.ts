import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../authorization/decorators/roles.decorator';
import { PaymentsQueryDto } from '../subscriptions/dto/admin-payments.dto';
import { ReportsService } from './reports.service';

@ApiTags('Admin')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('usage')
  @ApiOperation({ summary: 'Usage and costs per user (AI creations, storage, traffic), revenue and fair-use alerts; this month by default' })
  usage(@Query() query: PaymentsQueryDto) {
    return this.reports.usage(query);
  }

  @Get('finance')
  @ApiOperation({ summary: 'Revenue and expenses per plan, and the jewelry money (owed / transferred to jewelers); this month by default' })
  finance(@Query() query: PaymentsQueryDto) {
    return this.reports.finance(query);
  }
}
