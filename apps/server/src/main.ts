import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  app.setGlobalPrefix('api');
  await app.listen(3001, '0.0.0.0');
  console.log('📚 漫画聚合服务已启动: http://0.0.0.0:3001/api (局域网可访问)');
}
bootstrap();
