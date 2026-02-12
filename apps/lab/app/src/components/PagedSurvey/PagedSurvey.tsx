import type { ButtonAction } from "@app/runtime/types";
import { Button } from "@components/ui/Button";
import type { ReactElement } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Survey, type SurveyProps } from "../Survey";

type SurveyPageOverrides = Pick<
	SurveyProps,
	"onSubmitValues" | "registerNavigationGuard"
>;

export interface PagedSurveyPage {
	id: string;
	survey: Omit<SurveyProps, "registerNavigationGuard" | "onSubmitValues"> &
		SurveyPageOverrides;
}

export interface PagedSurveyProps {
	pages: PagedSurveyPage[];
	initialPageId?: string;
	onPageChange?: (page: { id: string; index: number }) => void | Promise<void>;
	onComplete?: (
		responses: Record<string, Record<string, unknown>>,
	) => void | Promise<void>;
	backLabel?: string;
	nextLabel?: string;
	finishLabel?: string;
	completeAction?: ButtonAction;
}

type NavigationGuard = (
	action: ButtonAction,
) => boolean | undefined | Promise<boolean | undefined>;

const EMPTY_SURVEY_PROPS: Omit<
	SurveyProps,
	"registerNavigationGuard" | "onSubmitValues"
> = {};

export function PagedSurvey(props: PagedSurveyProps): ReactElement | null {
	const {
		pages,
		initialPageId,
		onPageChange,
		onComplete,
		backLabel = "Back",
		nextLabel = "Continue",
		finishLabel = "Finish",
	} = props;

	const pageList = Array.isArray(pages) ? pages : [];

	const guardRef = useRef<NavigationGuard | null>(null);
	const responsesRef = useRef<Record<string, Record<string, unknown>>>({});

	const initialIndex = useMemo(() => {
		if (!pageList.length) return 0;
		if (!initialPageId) return 0;
		const index = pageList.findIndex((page) => page.id === initialPageId);
		return index >= 0 ? index : 0;
	}, [pageList, initialPageId]);

	const [pageIndex, setPageIndex] = useState(initialIndex);
	useEffect(() => {
		setPageIndex(initialIndex);
	}, [initialIndex]);

	const [responses, setResponses] = useState<
		Record<string, Record<string, unknown>>
	>(() => ({}));

	const [pendingAction, setPendingAction] = useState<"next" | "finish" | null>(
		null,
	);

	const currentPage = pageList[pageIndex] ?? null;
	const hasPrevious = pageIndex > 0;
	const hasNext = pageIndex < pageList.length - 1;

	useEffect(() => {
		setPageIndex((index) => {
			if (!pageList.length) return 0;
			return Math.min(index, pageList.length - 1);
		});
	}, [pageList.length]);

	useEffect(() => {
		responsesRef.current = responses;
	}, [responses]);

	useEffect(() => {
		if (!onPageChange) return;
		if (!currentPage) return;

		void onPageChange({ id: currentPage.id, index: pageIndex });
	}, [currentPage, onPageChange, pageIndex]);

	useEffect(() => {
		return () => {
			guardRef.current = null;
		};
	}, []);

	const currentPageId = currentPage?.id ?? "";
	const currentSurvey = currentPage?.survey ?? EMPTY_SURVEY_PROPS;

	const registerNavigationGuard = useCallback((guard: NavigationGuard) => {
		guardRef.current = guard;
		return () => {
			if (guardRef.current === guard) {
				guardRef.current = null;
			}
		};
	}, []);

	const storePageResponses = useCallback(
		(pageId: string, values: Record<string, unknown>) => {
			setResponses((previous) => {
				const next = { ...previous, [pageId]: values };
				responsesRef.current = next;
				return next;
			});
		},
		[],
	);

	const runGuard = useCallback(async (action: ButtonAction) => {
		const guard = guardRef.current;
		if (!guard) {
			return true;
		}

		try {
			const result = await guard(action);
			if (result === false) {
				return false;
			}
			return true;
		} catch (error) {
			console.error("PagedSurvey navigation blocked by guard", error);
			return false;
		}
	}, []);

	const handleBack = useCallback(() => {
		if (!hasPrevious) return;
		setPageIndex((index) => Math.max(0, index - 1));
	}, [hasPrevious]);

	const handleNext = useCallback(async () => {
		if (!hasNext) return;
		const nextPage = pageList[pageIndex + 1];
		if (!nextPage) return;

		setPendingAction("next");

		try {
			const canAdvance = await runGuard({ type: "go_to", target: nextPage.id });
			if (!canAdvance) return;
			setPageIndex((index) => Math.min(pageList.length - 1, index + 1));
		} finally {
			setPendingAction(null);
		}
	}, [hasNext, pageIndex, pageList, runGuard]);

	const handleFinish = useCallback(async () => {
		setPendingAction("finish");

		try {
			const canFinish = await runGuard({ type: "go_to", target: "__finish__" });
			if (!canFinish) return;

			if (onComplete) {
				const snapshot = { ...responsesRef.current };
				await onComplete(snapshot);
			}
		} finally {
			setPendingAction(null);
		}
	}, [onComplete, runGuard]);

	const pageInitialValues = useMemo(() => {
		const stored = responses[currentPageId];
		const pageInitial = currentSurvey.initialValues;
		if (stored) {
			return pageInitial ? { ...pageInitial, ...stored } : stored;
		}
		return pageInitial;
	}, [currentPageId, currentSurvey, responses]);

	const handleSubmitValues = useCallback(
		async (values: Record<string, unknown>) => {
			const pageSubmit = currentSurvey.onSubmitValues;
			if (pageSubmit) {
				await pageSubmit(values);
			}
			if (currentPageId) {
				storePageResponses(currentPageId, values);
			}
		},
		[currentPageId, currentSurvey, storePageResponses],
	);

	const surveyProps: SurveyProps = useMemo(() => {
		const {
			onSubmitValues: _ignoredOnSubmit,
			registerNavigationGuard: _ignoredRegister,
			...rest
		} = currentSurvey;

		return {
			...rest,
			initialValues: pageInitialValues,
			registerNavigationGuard,
			onSubmitValues: handleSubmitValues,
		};
	}, [
		currentSurvey,
		handleSubmitValues,
		pageInitialValues,
		registerNavigationGuard,
	]);

	if (!currentPage) {
		return (
			<div className="text-sm text-slate-500">No survey pages configured.</div>
		);
	}

	return (
		<div className="flex flex-col gap-8">
			<Survey key={currentPage.id} {...surveyProps} />

			<div className="mt-4 flex items-center justify-between gap-4 border-t border-slate-200 pt-6">
				<Button
					variant="ghost"
					onClick={handleBack}
					disabled={!hasPrevious || pendingAction !== null}
				>
					{backLabel}
				</Button>

				{hasNext ? (
					<Button onClick={handleNext} disabled={pendingAction !== null}>
						{pendingAction === "next" ? "Loading..." : nextLabel}
					</Button>
				) : (
					<Button onClick={handleFinish} disabled={pendingAction !== null}>
						{pendingAction === "finish" ? "Submitting..." : finishLabel}
					</Button>
				)}
			</div>
		</div>
	);
}
