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

type Follower = { following: boolean; lastTop: number; programmatic: boolean };

const attach = (element: Element, emit: (following: boolean) => void) => {
	const follower: Follower = { following: true, lastTop: element.scrollTop, programmatic: false };

	const setFollowing = (following: boolean) => {
		if (follower.following === following) return;

		follower.following = following;
		emit(following);
	};

	const pin = () => {
		follower.programmatic = true;
		jumpToBottom(element);
		follower.lastTop = element.scrollTop;
		requestAnimationFrame(() => {
			follower.programmatic = false;
			follower.lastTop = element.scrollTop;
		});
	};

	const onWheel = (event: Event) => {
		if (event instanceof WheelEvent && event.deltaY < 0) setFollowing(false);
	};

	const onKeyDown = (event: Event) => {
		if (event instanceof KeyboardEvent && ["PageUp", "ArrowUp", "Home"].includes(event.key)) setFollowing(false);
	};

	const onPointerDown = () => {
		if (!isNearBottom(element)) setFollowing(false);
	};

	const onScroll = () => {
		const top = element.scrollTop;
		const movedUp = top < follower.lastTop - 1;

		follower.lastTop = top;

		if (follower.programmatic) return;

		if (movedUp) setFollowing(false);
		else if (distanceFromBottom(element) < 4) setFollowing(true);
	};

	const onJump = () => {
		follower.following = true;
		emit(true);
		pin();
		requestAnimationFrame(pin);
	};

	const onGrow = () => {
		if (follower.following && distanceFromBottom(element) > 0) pin();
	};

	const observer = new MutationObserver(onGrow);

	observer.observe(element, { childList: true, subtree: true, characterData: true });
	element.addEventListener("wheel", onWheel, { passive: true });
	element.addEventListener("touchmove", onPointerDown, { passive: true });
	element.addEventListener("pointerdown", onPointerDown, { passive: true });
	element.addEventListener("keydown", onKeyDown);
	element.addEventListener("scroll", onScroll, { passive: true });
	element.addEventListener(JUMP_EVENT, onJump);
	pin();

	return () => {
		observer.disconnect();
		element.removeEventListener("wheel", onWheel);
		element.removeEventListener("touchmove", onPointerDown);
		element.removeEventListener("pointerdown", onPointerDown);
		element.removeEventListener("keydown", onKeyDown);
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
