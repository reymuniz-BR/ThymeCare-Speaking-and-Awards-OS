import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const autofillOpportunity = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ url: z.string().url().max(2000) }).parse(input))
  .handler(async ({ data }) => {
    const { autofillFromUrl } = await import("@/lib/autofill.server");
    return await autofillFromUrl(data.url);
  });
