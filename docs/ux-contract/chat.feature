Feature: The expected UX contract for an agent chat, October 2026
  Each scenario names where it was observed.
  my.ax = my-ax src/ui/Chat.svelte and its tests. chat.ax = chat-ax src/ui/Chat.svelte.
  t3 = t3.chat, observed in a browser on 2026-10-13. kody = kody.codes public site.
  Tags: @must is the floor. @should is common in mature apps. @agent applies when turns run tools for minutes.

  Rule: Scroll follows the reader, never the stream

    @must @my.ax @chat.ax
    Scenario: Following the stream while at the bottom
      Given I am within 80 px of the bottom of the transcript
      When new tokens arrive
      Then the transcript stays pinned to the newest line
      And the pin uses an instant jump, not a smooth animation

    @must @my.ax @chat.ax
    Scenario: Reading history while the agent streams
      Given I scrolled up more than 80 px from the bottom
      When new tokens, tool rows, or messages arrive
      Then my scroll position does not move by a single pixel
      And content added above my viewport does not push what I am reading

    @must @chat.ax
    Scenario: A scroll-wheel up releases the pin at once
      Given the transcript is pinned and streaming
      When I scroll up with the wheel or trackpad
      Then following stops on that event, before the next token arrives

    @must @my.ax @chat.ax
    Scenario: A way back to the newest message
      Given I am not at the bottom
      Then a "Scroll to latest" button is visible above the composer
      And it shows a count of unread messages that arrived while I was away
      When I press it
      Then the transcript scrolls to the bottom and following resumes
      And the unread count resets to zero

    @must @my.ax
    Scenario: Opening a conversation lands at the bottom
      When I open an existing conversation
      Then the newest message is visible when the loading state disappears
      And I never see the transcript scroll down from the top

    @should @my.ax
    Scenario: Older history pages in without a jump
      Given I scroll within 200 px of the top
      When an older page of history loads
      Then my scroll position is kept relative to the message I was reading

    @must @my.ax
    Scenario: My own message always pins
      When I send a message
      Then the transcript scrolls to the bottom, even if I had scrolled up

  Rule: The composer keeps what I type

    @must @my.ax @t3
    Scenario: Enter sends, Shift+Enter breaks a line, on desktop
      Given a desktop keyboard
      When I press Enter
      Then the message sends
      When I press Shift+Enter
      Then a newline is inserted

    @must @my.ax
    Scenario: Enter during IME composition never sends
      Given I am composing with an input method
      When I press Enter to confirm a candidate
      Then nothing is sent

    @must @my.ax
    Scenario: On a phone, Enter is a newline
      Given a touch keyboard
      When I press Return
      Then a newline is inserted and only the Send button sends

    @must @t3
    Scenario: The shortcut is written down
      Then the composer shows "Enter to send, Shift + Enter for new line" or equivalent

    @must @t3
    Scenario: The composer is focused and ready on load
      When a new chat opens
      Then the text box has focus, with no click needed

    @must @my.ax @t3
    Scenario: The composer grows with the text, up to a limit
      When I type more lines than fit
      Then the composer grows up to about 160 px, then scrolls inside itself

    @must @t3
    Scenario: Send is disabled for empty input, and says why
      Given the composer is empty
      Then the Send button is disabled with the label "Message requires text"

    @must @my.ax
    Scenario: A send that cannot go out keeps the draft
      Given the connection is down
      When I press Send
      Then the message is not sent
      And my text stays in the composer
      And I am told "Message not sent: reconnecting. Your draft is still in the composer"

    @must @my.ax
    Scenario: The draft survives a reload or a deploy
      Given I typed a draft and attached files
      When the page reloads for a new deploy
      Then the draft and the attachments come back in the same conversation
      And a draft older than one hour is dropped

    @should @t3
    Scenario: Typing hides the starter prompts
      Given the empty state shows suggested prompts
      When I type the first character
      Then the suggestions get out of the way

    @should @my.ax
    Scenario: Paste an image
      When I paste an image into the composer
      Then it becomes an attachment chip before I send

    @should @t3
    Scenario: Locked features say why they are locked
      Then a disabled control has a label such as "Attaching files is a subscriber-only feature"

  Rule: A running turn is visible, timed, and stoppable

    @must @t3 @my.ax
    Scenario: Send becomes Stop
      When a turn starts
      Then the Send button becomes a Stop button labelled "Cancel message"
      And the composer stays usable so I can draft the next message

    @must @my.ax
    Scenario: Esc stops the agent
      Given a turn is running and no modal is open
      When I press Esc
      Then the turn is cancelled

    @must @my.ax
    Scenario: A thinking indicator appears only when it is needed
      When a turn starts and no token has arrived yet
      Then a thinking indicator appears after a short delay, not on a fast reply
      And it is announced politely to screen readers

    @must @agent @my.ax
    Scenario: Each tool call shows a live timer
      Given a tool call is running
      Then its row shows the elapsed time, updated every second
      And the timer stops at the final value when the call ends

    @must @agent
    Scenario: The whole task shows a live timer
      Given a turn has been running for longer than a minute
      Then the page shows how long the whole task has run, such as "task 4m 12s"
      And the browser tab title shows that it is working

    @must @agent @my.ax
    Scenario: A stuck tool row never runs forever
      Given a turn ended without a result for a tool
      Then the tool row shows an error, not a timer that climbs forever

    @must @my.ax
    Scenario: A turn that ends with nothing visible says so
      When the agent finishes without visible output
      Then I am told "Agent completed without a visible response. Please retry."

    @must @agent @my.ax
    Scenario: Reasoning is folded
      When the reply includes reasoning
      Then it sits in a closed "Thinking" disclosure above the answer

    @should @my.ax
    Scenario: Tool rows keep their open or closed state while streaming
      Given I opened a tool row
      When the stream re-renders the message
      Then that row stays open

  Rule: The conversation list tells me what needs me

    @must @t3
    Scenario: A new chat appears in the list at once
      When I send the first message of a new chat
      Then the chat is listed under "Today" before the reply arrives
      And the URL changes to the chat's own address

    @must @t3
    Scenario: Each chat shows whether it is working
      Given a chat is running a turn
      Then its list row shows a "Response in progress" status
      And the indicator clears when the turn ends

    @must @agent
    Scenario: Each chat shows working, idle, or failed at a glance
      Then each row has a dot: animated for working, green for idle, red for failed

    @must @t3
    Scenario: The list is grouped by time and searchable
      Then chats are grouped as Today, Yesterday, Last 7 days, Older
      And a search box filters threads by title

    @should @t3
    Scenario: Pin, archive, and rename from the row
      Then each row has Pin and Archive actions on hover
      And double-clicking the title renames it in place

    @should @chat.ax
    Scenario: Delete asks first
      When I delete a conversation
      Then I am asked to confirm, naming the conversation

  Rule: Messages have actions where I need them

    @must @t3 @my.ax
    Scenario: Copy a message
      Then each message has a Copy button that copies its markdown

    @must @my.ax
    Scenario: Copy a code block
      Then each code block has a "copy" button that changes to "copied" for about one second

    @must @t3
    Scenario: Retry, edit, and branch
      Then my messages have Retry, Edit, and Branch off actions
      And a disabled action says what it needs, such as "You need to sign in to edit messages"

    @must @my.ax
    Scenario: Code is highlighted without blocking the first token
      When a reply with code streams in
      Then markdown renders from the first token
      And syntax highlighting loads lazily and upgrades the block

  Rule: Connection state is truthful

    @must @my.ax
    Scenario: Reconnecting is shown, then gives up honestly
      When the socket drops
      Then the page says "Reconnecting"
      When reconnects keep failing
      Then the page says it is offline and shows Retry, instead of spinning forever

    @must @my.ax
    Scenario: A stale close cannot undo a good connection
      Given a new socket already opened
      When the old socket's close event arrives late
      Then the state stays connected

    @must @my.ax
    Scenario: A backgrounded tab catches up when it returns
      Given the tab was hidden while a turn finished
      When I return to the tab
      Then the page reconnects and shows the finished turn

    @must @agent @my.ax @chat.ax
    Scenario: A turn interrupted by a restart resumes
      Given the server restarted mid tool call
      Then the turn resumes from its last checkpoint, and the transcript says so

  Rule: Notices are placed in time, not pinned on top

    @must @my.ax
    Scenario: Errors sit in the transcript in order
      When a system notice or error appears
      Then it sits after the messages it relates to, not above newer messages
      And starting a new turn clears transient notices

    @must @my.ax
    Scenario: A long error is summarised, with detail on demand
      Then an error shows one readable line
      And the full text is available in a disclosure or a details view

  Rule: The page works for everyone

    @must @my.ax @t3
    Scenario: The transcript is a polite live region
      Then the transcript is a log or aria-live="polite" region with a heading

    @must
    Scenario: Motion respects the system setting
      Given reduced motion is on
      Then streaming, spinners, and smooth scrolls do not animate

    @must @t3
    Scenario: Every icon button has a name
      Then every icon-only button has an accessible label

    @should @t3
    Scenario: Notifications have a keyboard shortcut
      Then the notification region is reachable with a documented shortcut such as Alt+T

  Rule: The first screen invites a first message

    @must @t3 @kody
    Scenario: The empty state offers starters
      When there are no messages
      Then the page asks a plain question such as "How can I help you?"
      And offers three to five one-click starters

    @should @my.ax
    Scenario: Starters belong to the owner
      Then the owner can edit the starter list in Settings

    @should @kody
    Scenario: The copy names the outcome, not the feature
      Then the empty-state copy says what the reader gets, in one short line
