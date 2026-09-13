import { createZodDto } from 'nestjs-zod';
import { guestbookRequestLinkSchema, guestbookAddCommentSchema, guestbookSettingsSchema } from '@trek/shared';

/**
 * createZodDto wrappers over the @trek/shared guestbook contracts, so the global
 * ZodValidationPipe recognises these @Body() params by metatype and the boot
 * body-contract gate is satisfied. The schemas are permissive on purpose — the
 * controllers keep their own bespoke 400 messages (see guestbook.schema.ts).
 */
export class GuestbookRequestLinkDto extends createZodDto(guestbookRequestLinkSchema) {}
export class GuestbookAddCommentDto extends createZodDto(guestbookAddCommentSchema) {}
export class GuestbookSettingsDto extends createZodDto(guestbookSettingsSchema) {}
