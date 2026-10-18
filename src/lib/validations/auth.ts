import { z } from "zod";

export const signInSchema = z.object({
  email: z.string().email("Ongeldig e-mailadres"),
  password: z.string().min(1, "Wachtwoord is verplicht"),
});

export const signUpSchema = z.object({
  email: z.string().email("Ongeldig e-mailadres"),
  password: z.string().min(6, "Wachtwoord moet minstens 6 tekens bevatten"),
  display_name: z.string().min(1, "Naam is verplicht").max(100, "Naam mag maximaal 100 tekens zijn"),
});

export const resetPasswordSchema = z.object({
  email: z.string().email("Ongeldig e-mailadres"),
});

export const newPasswordSchema = z
  .object({
    password: z
      .string()
      .min(6, "Wachtwoord moet minstens 6 tekens bevatten")
      .max(128, "Wachtwoord is te lang (maximaal 128 tekens)"),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: "De wachtwoorden zijn niet gelijk", path: ["confirm"] });

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
