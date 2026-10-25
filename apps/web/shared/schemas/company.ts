/** Manufacturer details (GPSR): Roslett as quasi-manufacturer, entered once. */

import { z } from 'zod';
import { requiredText } from './common.js';

export const companySettingsSchema = z.object({
  manufacturerName: requiredText('Name'),
  /** Postal business address, never a private one. */
  manufacturerAddress: requiredText('Adresse', 500),
  manufacturerEmail: z.email({ message: 'Bitte eine gültige E-Mail-Adresse angeben.' }).trim(),
});

export type CompanySettings = z.infer<typeof companySettingsSchema>;
