import { createFileRoute, Link } from "@tanstack/react-router";
import { pageTitle, productName, workspaceConfig } from "@/lib/workspace";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: pageTitle("Privacy") },
      {
        name: "description",
        content: "What Podium collects and how it uses Google data.",
      },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12 text-[14px] leading-relaxed">
      <h1 className="mb-1 text-xl font-semibold">Privacy</h1>
      <p className="mb-8 text-muted-foreground">{productName()}</p>

      <section className="space-y-3">
        <p>
          This is an internal workspace for the team that runs {workspaceConfig().name}&rsquo;s
          speaking and awards program. Only people an administrator has approved can use it.
        </p>

        <h2 className="pt-4 font-semibold">What it collects</h2>
        <p>
          When you sign in with Google, the app receives your name, email address and profile photo.
          It uses your email to check that you are on the approved list, and records your name
          against the changes you make. It also stores the opportunities, submissions and notes the
          team enters.
        </p>

        <h2 className="pt-4 font-semibold">Google Drive</h2>
        <p>
          Signing in never grants Drive access. Separately, a manager can connect one Google account
          so the app can read the program&rsquo;s shared folder, master messaging document and
          master tracker. That access is read-only: the app never creates, edits or deletes Drive
          files. It can be removed in the app&rsquo;s Settings or at{" "}
          <a className="underline" href="https://myaccount.google.com/permissions">
            myaccount.google.com/permissions
          </a>
          .
        </p>

        <h2 className="pt-4 font-semibold">Where it goes</h2>
        <p>
          Data is stored in Google Cloud and used only to run this workspace. It is not sold or
          shared with anyone outside the team.
        </p>

        <h2 className="pt-4 font-semibold">Contact</h2>
        <p>
          Questions or removal requests:{" "}
          <a className="underline" href="mailto:rey.muniz@berlinrosen.com">
            rey.muniz@berlinrosen.com
          </a>
          .
        </p>
      </section>

      <p className="mt-10">
        <Link to="/auth" className="underline">
          Back to sign in
        </Link>
      </p>
    </main>
  );
}
