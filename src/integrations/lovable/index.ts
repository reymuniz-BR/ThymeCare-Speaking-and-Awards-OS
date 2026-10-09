import { auth, googleAuthProvider } from "@/lib/firebase";
import { signInWithPopup } from "firebase/auth";

type SignInOptions = {
  redirect_uri?: string;
  extraParams?: Record<string, string>;
};

export const lovable = {
  auth: {
    signInWithOAuth: async (
      _provider: "google" | "apple" | "microsoft" | "lovable",
      _opts?: SignInOptions,
    ) => {
      try {
        const result = await signInWithPopup(auth, googleAuthProvider);
        return { error: null, redirected: false, user: result.user };
      } catch (e) {
        return { error: e instanceof Error ? e : new Error(String(e)), redirected: false };
      }
    },
  },
};
