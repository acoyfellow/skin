---
title: The expected UX contract for an agent chat
description: Fifty-one behaviors that people expect from an agent chat in October 2026, written as Gherkin so each one can be tested.
status: draft
---

# The expected UX contract for an agent chat

I asked an agent to make my app dark. It wrote the change, the change passed every check, and the page went live. I scrolled up to read what it did. The page pulled me back to the bottom with every new token. When I looked for how long it had worked, the only timer was on the current tool call. The task had run for eleven minutes.

Nothing was broken. The app did not keep a set of promises that people now expect from every chat. I could not name the promises, so I wrote them down.

This post lists those promises. Each one is a Gherkin scenario. Each one names the app where I saw it. The file is `chat.feature`, and it is the contract that my apps must keep from now on.

## Where the list comes from

I took the behaviors from four sources:

- **my.ax**, my most mature agent chat. I read `src/ui/Chat.svelte` (2,967 lines) and the test names next to it. The tests describe behavior in plain sentences, such as "DESKTOP: mid-IME-composition Enter is ignored (never sends)".
- **chat.ax**, a multi-person agent chat. I read `src/ui/Chat.svelte` (1,400 lines).
- **t3.chat**, which I used in a browser on 13 October 2026. I sent one message as a guest. A captcha stopped the reply, so I did not see its streaming or scroll behavior.
- **kody.codes**, from its public pages only. Its chat is behind a login.

A behavior goes in the contract when I saw it in at least one of these apps and its absence would annoy me. The tags show the source of each scenario. `@must` is the floor. `@should` is common in mature apps. `@agent` applies when a turn runs tools for minutes, not seconds.

This is not a survey of the market. Four apps, three of them close to me. Treat the list as a floor, not a ceiling.

## 1. Scroll follows the reader, never the stream

This rule caused the problem in the first paragraph, and it is the one that most chat apps get wrong.

my.ax decides "pinned" with one number: the reader is within 80 px of the bottom. chat.ax uses 120 px. When pinned, new content jumps the view to the bottom. When not pinned, new content does not move the view at all.

```gherkin
Scenario: Reading history while the agent streams
  Given I scrolled up more than 80 px from the bottom
  When new tokens, tool rows, or messages arrive
  Then my scroll position does not move by a single pixel
```

Three details make this work in practice:

- **Release on the wheel event, not on the next token.** chat.ax stops following as soon as the wheel moves up (`stopFollowing` on `deltaY`). If you wait for the next scroll check, a fast stream wins the race and pulls the reader back.
- **Jump, do not glide, while pinned.** my.ax sets `scroll-behavior: auto` for the pin and restores it on the next frame. A smooth scroll on each token makes the page wobble.
- **Offer a way back, with a count.** Both apps show a "Scroll to latest" button when the reader is not at the bottom. chat.ax counts the messages that arrived (`unreadMessages`) and resets the count at the bottom.

Two more: a conversation opens already at the bottom (my.ax hides the scroll from the top behind the loading state), and sending your own message always pins, even if you scrolled up.

## 2. The composer keeps what I type

t3.chat writes the rule under the box: "Press Enter to send, Shift + Enter for new line". my.ax adds two exceptions that most apps miss, and its tests name them:

```gherkin
Scenario: Enter during IME composition never sends
Scenario: On a phone, Enter is a newline
```

The first protects people who type Japanese, Chinese, or Korean. Enter confirms a candidate; it must not send half a sentence. my.ax checks `isComposing` and the legacy `keyCode === 229`. The second protects phone users, who have no Shift key.

The draft is sacred. When my.ax cannot send because the socket is down, it keeps the text and says so: "Message not sent: reconnecting. Your draft is still in the composer". When a deploy reloads the page, it stores the draft and the attachments in `sessionStorage` and restores them in the same conversation, unless the draft is older than one hour.

Smaller items from t3.chat: the box has focus on load, the starter prompts go away when you type, and every disabled control says why. The empty Send button is labelled "Message requires text". The locked Attach button says "Attaching files is a subscriber-only feature".

## 3. A running turn is visible, timed, and stoppable

When a turn starts, Send becomes Stop. t3.chat labels it "Cancel message". my.ax also stops the turn on Esc, unless a modal is open.

Agents add a need that plain chat does not have: a turn can run for many minutes. One timer is not enough.

```gherkin
Scenario: Each tool call shows a live timer
Scenario: The whole task shows a live timer
  Given a turn has been running for longer than a minute
  Then the page shows how long the whole task has run, such as "task 4m 12s"
```

my.ax ticks each pending tool row every second and stops the ticker when no row is pending. It also refuses to let a timer run forever. If the turn ends while a tool has no result, the row changes to an error. A timer that climbs after the work stopped is a lie the reader cannot detect.

my.ax also catches the empty finish: "Agent completed without a visible response. Please retry." Reasoning goes in a closed "Thinking" disclosure, so the answer is the first thing you read.

## 4. The conversation list tells me what needs me

t3.chat adds the new chat to the list under "Today" the moment you send, and changes the URL to the chat's own address. The row shows a "Response in progress" status until the reply ends. Rows have Pin and Archive actions, and a double-click renames the title in place.

For agents, "in progress" is not enough. A chat that failed while I looked elsewhere needs me more than one that finished. The contract asks for three states on every row: an animated dot for working, green for idle, red for failed.

## 5. Messages have actions where I need them

Copy on every message (t3.chat, my.ax). Copy on every code block, with "copy" changing to "copied" for about a second (my.ax). Retry, Edit, and Branch off on my own messages (t3.chat). Markdown renders from the first token, and syntax highlighting loads later and upgrades the block (my.ax ships the markdown parser in the main bundle for this reason).

## 6. Connection state is truthful

my.ax has the most scars here, and the test names show them:

- "a stale socket close after the new socket opens cannot flip state back to reconnecting"
- "an offline bootstrap keeps the cached session instead of discarding it"
- reconnects give up after a bound and show "offline" with Retry, instead of "Reconnecting…" forever.

A tab in the background can miss the end of a stream. my.ax checks again when the tab becomes visible and forces a fresh socket if the state is stale. Both my.ax and chat.ax resume a turn that a server restart cut off mid tool call, and the transcript says so.

## 7. Notices are placed in time

my.ax renders toasts after the messages, in time order, "so a transient notice sits in chronological position, never pinned above newer" content. A new turn clears them. A long error shows one line; the full text is one click away.

## 8. The page works for everyone

The transcript is a `log` region with a heading (t3.chat) or `aria-live="polite"` (my.ax). Every icon button has a name. Motion stops when the system asks for reduced motion. t3.chat puts notifications in a region with a documented shortcut, Alt+T.

## 9. The first screen invites a first message

t3.chat asks "How can I help you?" and offers four one-click starters. my.ax lets the owner edit the starter list, so the empty state is never blank and never generic. kody.codes shows the copy rule well: each feature has one line that says what you get, such as "Context that comes with you."

## How my own app scores

I checked skin, the app from the first paragraph, against the `@must` scenarios. It fails most of them:

| Rule | skin today |
| --- | --- |
| Scroll follows the reader | No scroll logic at all. The log does not pin, and has no "Scroll to latest". |
| Enter, Shift+Enter, IME, phone | Enter and Shift+Enter work. No IME guard. No phone rule. |
| Draft survives a failed send or reload | No. |
| Stop and Esc | No Stop button in the composer. No Esc. |
| Per-tool timer | Yes. |
| Whole-task timer | Added this week. Not yet visible in my own copy of the app. |
| Chat list states | Added this week, the same way. |
| Copy message and code | No. |
| Markdown | No. Replies are plain text. |
| Truthful connection | Partly. A hidden tab showed "Connecting" forever until this week. |

That is the honest starting point. The fix list is the feature file.

## How to use the contract

1. Copy `chat.feature` into the app.
2. Mark each scenario pass, fail, or not applicable.
3. Turn each `@must` scenario into a browser test. Most need one page and one assertion; the scroll rules need a slow fake stream.
4. When a new app does something better, add a scenario, tag the source, and date it.

The contract will go stale. The date in the feature title is the point: it is a record of what the market expected on that day.

## Open questions

- I did not see t3.chat stream. Its scroll behavior is not in the contract yet.
- I did not test my.ax or chat.ax in a browser for this post. The scenarios come from their code and test names.
- The 80 px threshold comes from one app. I do not know if it is right for long code blocks on a phone.
