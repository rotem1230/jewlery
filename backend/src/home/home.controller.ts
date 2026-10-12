import { Controller, Get, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { Request } from 'express';
import { HomeService } from './home.service';

type AuthedRequest = Request & { user: User };

@ApiTags('Home')
@ApiBearerAuth()
@Controller('home')
export class HomeController {
  constructor(private readonly home: HomeService) {}

  @Get('summary')
  summary(@Req() req: AuthedRequest) {
    return this.home.getSummary(req.user);
  }
}
