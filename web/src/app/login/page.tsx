import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in · Executive Agent" };

export default function LoginPage() {
  return (
    <main className="flex min-h-full items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <h1 className="font-serif text-3xl leading-tight text-ink">Executive Agent</h1>
        <p className="mt-2 text-sm text-slate">Private briefings from your documents.</p>
        <LoginForm />
      </div>
    </main>
  );
}
