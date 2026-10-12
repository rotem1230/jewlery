import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function setupSwagger(app: INestApplication, apiPrefix: string) {
  const config = new DocumentBuilder()
    .setTitle('Malinvosky / Tsila API')
    .setDescription(
      [
        'Jewelry design & jeweler marketplace API (api/v1).',
        'Phase contracts: docs/backend-contracts.md.',
        'WebSocket chat: connect to /ws with auth.token or ?token= JWT; rooms conversation:{id}; events message:new, message:read.',
        'Phase 2/3 features are feature-flagged (default off).',
      ].join(' '),
    )
    .setVersion('0.1.0')
    .addBearerAuth()
    .addTag('Auth')
    .addTag('Users')
    .addTag('Home')
    .addTag('Designs')
    .addTag('Gallery')
    .addTag('Wizard')
    .addTag('MasterData')
    .addTag('Uploads')
    .addTag('RenderJobs')
    .addTag('AI')
    .addTag('Atelier')
    .addTag('JewelerProfiles')
    .addTag('Reviews')
    .addTag('Chat')
    .addTag('Quotes')
    .addTag('Notifications')
    .addTag('Subscriptions')
    .addTag('Webhooks')
    .addTag('Visualization')
    .addTag('Promotions')
    .addTag('Config')
    .addTag('Content')
    .addTag('FeatureFlags')
    .addTag('Health')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(`${apiPrefix}/docs`, app, document);
}
