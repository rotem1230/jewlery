import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';

type MappedError = { status: number; message: string; code?: string };

/**
 * Database errors that describe the request, not a server fault. Anything else stays an opaque
 * 500; the client never sees database messages.
 */
function mapPrismaError(err: Prisma.PrismaClientKnownRequestError): MappedError | null {
  switch (err.code) {
    case 'P2002':
      return { status: HttpStatus.CONFLICT, message: 'This resource already exists', code: 'CONFLICT' };
    case 'P2023': // malformed identifier (e.g. not a UUID)
    case 'P2025': // record to update / delete does not exist
      return { status: HttpStatus.NOT_FOUND, message: 'Not found' };
    case 'P2010': // raw query: invalid text representation (e.g. a bad ::uuid cast)
      return (err.meta as { code?: string } | undefined)?.code === '22P02'
        ? { status: HttpStatus.NOT_FOUND, message: 'Not found' }
        : null;
    case 'P2028': // transaction could not start / timed out under load
      return { status: HttpStatus.SERVICE_UNAVAILABLE, message: 'The service is busy, please retry', code: 'RETRY' };
    case 'P2034': // write conflict or deadlock
      return { status: HttpStatus.CONFLICT, message: 'Conflicting concurrent update, please retry', code: 'RETRY' };
    default:
      return null;
  }
}

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    const body =
      typeof exceptionResponse === 'string'
        ? { success: false, message: exceptionResponse }
        : { success: false, ...(exceptionResponse as object) };

    if (status >= 500) {
      this.logger.error(exception.message, exception.stack);
    }

    response.status(status).json(body);
  }
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const mapped = exception instanceof Prisma.PrismaClientKnownRequestError ? mapPrismaError(exception) : null;
    if (mapped) {
      const prismaError = exception as Prisma.PrismaClientKnownRequestError;
      this.logger.warn(`Prisma ${prismaError.code} answered as ${mapped.status}`);
      response.status(mapped.status).json({
        success: false,
        message: mapped.message,
        ...(mapped.code ? { code: mapped.code } : {}),
      });
      return;
    }

    this.logger.error(
      exception instanceof Error ? exception.message : 'Unknown error',
      exception instanceof Error ? exception.stack : undefined,
    );

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Internal server error',
    });
  }
}
