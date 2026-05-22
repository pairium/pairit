import { api, type Me } from "@app/lib/api";
import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useState,
} from "react";

type MeContextValue = {
	me: Me | null;
	loading: boolean;
};

const MeContext = createContext<MeContextValue>({ me: null, loading: true });

export function MeProvider({ children }: { children: ReactNode }) {
	const [me, setMe] = useState<Me | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let cancelled = false;
		api
			.me()
			.then((data) => {
				if (!cancelled) setMe(data);
			})
			.catch(() => {
				if (!cancelled) setMe(null);
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, []);

	return (
		<MeContext.Provider value={{ me, loading }}>{children}</MeContext.Provider>
	);
}

export function useMe(): MeContextValue {
	return useContext(MeContext);
}
