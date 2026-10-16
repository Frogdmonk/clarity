import { z } from "zod";
import { DEFAULT_UG_REGEX } from "./ug";

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email());
export const passwordSchema = z.string().min(10, "Use at least 10 characters.").max(200);

export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(200) });

export const registerSchema = z.object({
  full_name: z.string().trim().min(2).max(120),
  ug_number: z
    .string()
    .trim()
    .refine((v) => DEFAULT_UG_REGEX.test(v.toUpperCase()), "UG number must look like UG/24/00123."),
  email: emailSchema,
  password: passwordSchema,
  consent: z.literal("on", { error: "Please accept the privacy notice." }),
});

export const resetSchema = z.object({ password: passwordSchema });

export const helpRequestSchema = z.object({
  category: z.enum(["concept", "coding", "example", "pace", "other"]),
  message: z.string().trim().min(1, "Write a few words.").max(2000),
});

export const replySchema = z.object({ body: z.string().trim().min(1).max(4000) });
export const noteSchema = z.object({ note: z.string().trim().min(1).max(4000) });
export const titleSchema = z.string().trim().min(2).max(160);
