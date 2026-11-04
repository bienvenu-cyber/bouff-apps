"use client";

import { bouffDb } from "@/lib/bouff-data/supabase";
import { resetPassword } from "@/lib/bouff-data/auth";
import CustomButton from "@/lib/ui/useable-components/button";
import CustomPasswordTextField from "@/lib/ui/useable-components/password-input-field";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function ResetPasswordPage() {
  const t = useTranslations();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [sessionReady, setSessionReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    void bouffDb().auth.getSession().then(({ data, error }) => {
      if (!mounted) return;
      if (error || !data.session) {
        router.replace("/auth/forgot-password?error=invalid");
        return;
      }
      setEmail(data.session.user.email ?? "");
      setSessionReady(true);
    }).catch(() => {
      if (mounted) router.replace("/auth/forgot-password?error=invalid");
    });
    return () => { mounted = false; };
  }, [router]);

  const handleSubmit = async () => {
    if (!sessionReady || loading) return;
    if (!password || password.length < 6) {
      setErrorMessage(t("please_enter_valid_password_message"));
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage(t("Password_does_not_match"));
      return;
    }

    try {
      setErrorMessage("");
      setLoading(true);
      const response = await resetPassword(password);

      if (response.result) {
        router.replace("/auth/login?reset=success");
        return;
      }

      router.replace(
        `/auth/forgot-password?error=invalid&email=${encodeURIComponent(email)}`,
      );
    } catch {
      router.replace(
        `/auth/forgot-password?error=invalid&email=${encodeURIComponent(email)}`,
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col justify-center px-6 py-16">
      <h1 className="text-3xl font-semibold">{t("update_password_title")}</h1>
      <p className="mt-3 text-sm text-neutral-600">
        {email || t("reset_link_invalid_or_expired_message")}
      </p>
      <div className="mt-6 flex flex-col gap-4">
        <CustomPasswordTextField
          value={password}
          showLabel={false}
          name="password"
          placeholder={t("password_label")}
          onChange={(e) => setPassword(e.target.value)}
        />
        <CustomPasswordTextField
          value={confirmPassword}
          showLabel={false}
          name="confirmPassword"
          placeholder={t("Confirm Password")}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
      </div>
      {errorMessage ? (
        <p className="mt-4 text-sm text-red-500">{errorMessage}</p>
      ) : null}
      <CustomButton
        label={t("continue_label")}
        loading={loading || !sessionReady}
        onClick={handleSubmit}
        className="mt-6 rounded-full bg-primary-color p-3"
      />
    </div>
  );
}
