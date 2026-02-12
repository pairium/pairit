import { useSession } from "@app/lib/auth-client";

export function useAuth() {
	const { data: session, isPending, error } = useSession();

	return {
		user: session?.user ?? null,
		session: session?.session ?? null,
		isLoading: isPending,
		isAuthenticated: !!session?.user,
		error,
	};
}
