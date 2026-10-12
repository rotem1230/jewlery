import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { CmsModule } from '../cms/cms.module';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { MailModule } from '../mail/mail.module';
import { AuthWebController } from './auth-web.controller';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { jwtModuleOptions } from './jwt-options';
import { HttpJwksProvider, JWKS_PROVIDER } from './oauth/jwks.provider';
import { OAuthTokenVerifier } from './oauth/oauth-token-verifier';
import { PasswordService } from './services/password.service';
import { TokenService } from './services/token.service';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: jwtModuleOptions,
    }),
    CmsModule,
    MailModule,
    FeatureFlagsModule,
  ],
  controllers: [AuthController, AuthWebController],
  providers: [
    AuthService,
    PasswordService,
    TokenService,
    JwtStrategy,
    OAuthTokenVerifier,
    { provide: JWKS_PROVIDER, useClass: HttpJwksProvider },
  ],
  exports: [AuthService, PasswordService, TokenService],
})
export class AuthModule {}
