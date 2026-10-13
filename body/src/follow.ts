import { Effect, Queue, Stream } from "effect";
import { Mount } from "foldkit";
import { Message } from "./message";

export const PIN_DISTANCE_PX = 80;

export const JUMP_EVENT = "basic:jump-to-latest";

export const distanceFromBottom = (element: Pick<Element, "scrollHeight" | "clientHeight" | "scrollTop">): number =>
	element.scrollHeight - element.clientHeight - element.scrollTop;

export const isNearBottom = (element: Pick<Element, "scrollHeight" | "clientHeight" | "scrollTop">): boolean => distanceFromBottom(element) < PIN_DISTANCE_PX;

const jumpToBottom = (element: Element): void => {
	if (!(element instanceof HTMLElement)) return;

	const log = element;
	const behavior = log.style.scrollBehavior;

	log.style.scrollBehavior = "auto";
	log.scrollTop = log.scrollHeight;
	requestAnimationFrame(() => {
		log.style.scrollBehavior = behavior;
	});
};

type Follower = { following: boolean };

const attach = (element: Element, emit: (following: boolean) => void) => {
	const follower: Follower = { following: true };

	const setFollowing = (following: boolean) => {
		if (follower.following === following) return;

		follower.following = following;
		emit(following);
	};

	const onWheel = (event: Event) => {
		if (event instanceof WheelEvent && event.deltaY < 0) setFollowing(false);
	};

	const onTouchMove = () => {
		if (!isNearBottom(element)) setFollowing(false);
	};

	const onScroll = () => setFollowing(isNearBottom(element));

	const onJump = () => {
		setFollowing(true);
		jumpToBottom(element);
	};

	const onGrow = () => {
		if (follower.following) jumpToBottom(element);
	};

	const observer = new MutationObserver(onGrow);

	observer.observe(element, { childList: true, subtree: true, characterData: true });
	element.addEventListener("wheel", onWheel, { passive: true });
	element.addEventListener("touchmove", onTouchMove, { passive: true });
	element.addEventListener("scroll", onScroll, { passive: true });
	element.addEventListener(JUMP_EVENT, onJump);
	jumpToBottom(element);

	return () => {
		observer.disconnect();
		element.removeEventListener("wheel", onWheel);
		element.removeEventListener("touchmove", onTouchMove);
		element.removeEventListener("scroll", onScroll);
		element.removeEventListener(JUMP_EVENT, onJump);
	};
};

export const FollowLog = Mount.defineStream("FollowLog", {
	messages: [Message.ChangedFollowing],
	execute: ({ element }) =>
		Stream.callback<ReturnType<typeof Message.ChangedFollowing>>((queue) =>
			Effect.acquireRelease(
				Effect.sync(() => attach(element, (following) => Queue.offerUnsafe(queue, Message.ChangedFollowing({ following })))),
				(detach) => Effect.sync(detach),
			).pipe(Effect.andThen(Effect.never)),
		),
});
