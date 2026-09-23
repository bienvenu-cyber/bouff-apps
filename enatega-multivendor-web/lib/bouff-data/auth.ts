import { bouffDb } from "./supabase";
import { GUEST_STORAGE_KEY } from "./config";

export interface GuestIdentity {
  name: string;
  phone: string;
}

export function getGuest(): GuestIdentity | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(GUEST_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as GuestIdentity) : null;
  } catch {
    return null;
  }
}

export function setGuest(identity: GuestIdentity) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(identity));
}

function sessionPayload(session: {
  access_token: string;
  expires_at?: number;
  user: { id: string; email?: string | null };
}) {
  return {
    userId: session.user.id,
    token: session.access_token,
    tokenExpiration: String((session.expires_at ?? 0) * 1000),
    isActive: true,
    email: session.user.email ?? null,
  };
}

export async function login(variables: {
  email?: string;
  password?: string;
  type?: string;
  name?: string;
}) {
  const db = bouffDb();
  if (!variables.email || !variables.password) {
    throw new Error("E-mail et mot de passe requis.");
  }
  const { data, error } = await db.auth.signInWithPassword({
    email: variables.email,
    password: variables.password,
  });
  if (error) throw new Error(error.message);
  const profile = await fetchProfile();
  return {
    ...sessionPayload(data.session!),
    name: profile?.name ?? variables.name ?? "",
    phone: profile?.phone ?? "",
    phoneIsVerified: false,
    emailIsVerified: Boolean(data.user?.email_confirmed_at),
    picture: null,
    addresses: [],
    isNewUser: false,
    userTypeId: null,
  };
}

export async function createUser(variables: {
  email?: string;
  password?: string;
  name?: string;
  phone?: string;
}) {
  const db = bouffDb();
  if (!variables.email || !variables.password) {
    throw new Error("E-mail et mot de passe requis.");
  }
  const { data, error } = await db.auth.signUp({
    email: variables.email,
    password: variables.password,
    options: {
      data: { full_name: variables.name ?? "", phone: variables.phone ?? "" },
    },
  });
  if (error) throw new Error(error.message);

  if (data.session) {
    await db.from("profiles").upsert({
      id: data.session.user.id,
      full_name: variables.name ?? null,
      phone: variables.phone ?? null,
    });
    await db
      .from("user_roles")
      .upsert(
        { user_id: data.session.user.id, role: "client" },
        { onConflict: "user_id,role,restaurant_id" },
      );
    return {
      ...sessionPayload(data.session),
      name: variables.name ?? "",
      phone: variables.phone ?? "",
      phoneIsVerified: false,
      emailIsVerified: Boolean(data.user?.email_confirmed_at),
      picture: null,
      isNewUser: true,
      userTypeId: null,
    };
  }

  // Confirmation d'e-mail activée : pas encore de session.
  return {
    userId: data.user?.id ?? "",
    token: "",
    tokenExpiration: "0",
    name: variables.name ?? "",
    phone: variables.phone ?? "",
    phoneIsVerified: false,
    emailIsVerified: false,
    picture: null,
    isNewUser: true,
    userTypeId: null,
  };
}

export async function fetchProfile() {
  const db = bouffDb();
  const { data: auth } = await db.auth.getUser();
  const user = auth.user;
  if (!user) return null;
  const { data: profile } = await db
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  return {
    _id: user.id,
    name: profile?.full_name ?? "",
    phone: profile?.phone ?? "",
    email: user.email ?? "",
    emailIsVerified: Boolean(user.email_confirmed_at),
    phoneIsVerified: false,
    notificationToken: null,
    userType: "default",
    isActive: true,
    isOrderNotification: true,
    isOfferNotification: true,
    addresses: [],
    favourite: [],
    stripe_plan_id: null,
  };
}

export async function updateUser(variables: {
  name?: string;
  phone?: string | null;
}) {
  const db = bouffDb();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) throw new Error("Connexion requise.");
  await db.from("profiles").upsert({
    id: auth.user.id,
    full_name: variables.name ?? null,
    phone: variables.phone ?? null,
  });
  return {
    _id: auth.user.id,
    name: variables.name ?? "",
    phone: variables.phone ?? "",
    phoneIsVerified: false,
    emailIsVerified: Boolean(auth.user.email_confirmed_at),
  };
}

export async function forgotPassword(email: string) {
  const db = bouffDb();
  const redirectTo =
    typeof window !== "undefined" ? `${window.location.origin}/auth/reset` : undefined;
  const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw new Error(error.message);
  return { result: true };
}

export async function resetPassword(password: string) {
  const db = bouffDb();
  const { error } = await db.auth.updateUser({ password });
  if (error) throw new Error(error.message);
  return { result: true };
}

export async function signOut() {
  await bouffDb().auth.signOut();
}
