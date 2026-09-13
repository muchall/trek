import { Module } from '@nestjs/common';
import { JourneyDomainModule } from '../journey/journey-domain.module';
import { MailerModule } from '../notifications/mailer/mailer.module';
import { RateLimitModule } from '../common/rate-limit.module';
import { AddonsModule } from '../addons/addons.module';
import { GuestAuthService } from './guest-auth.service';
import { JourneyGuestbookService } from './journey-guestbook.service';
import { GuestAuthController } from './guest-auth.controller';
import { GuestbookPublicController } from './guestbook-public.controller';
import { GuestbookOwnerController } from './guestbook-owner.controller';

/**
 * Journey guestbook: email-verified public visitors leave comments + likes on
 * journey entries; the owner moderates from the authenticated app.
 *
 * Self-contained on purpose (keeps the upstream-merge surface tiny): everything
 * lives here, and the only edit to stock TREK is adding this module to the
 * AppModule imports. JourneyDomainModule brings JourneyShareService (share-token
 * validation) and JourneyDomainService (owner check) without dragging the photo
 * providers in via the full JourneyModule.
 */
@Module({
  imports: [JourneyDomainModule, MailerModule, RateLimitModule, AddonsModule],
  controllers: [GuestAuthController, GuestbookPublicController, GuestbookOwnerController],
  providers: [GuestAuthService, JourneyGuestbookService],
})
export class JourneyGuestbookModule {}
