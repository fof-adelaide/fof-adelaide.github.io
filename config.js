/* Everything you're likely to edit lives here: the Sheets address and all of the wording. */
window.FOF_CONFIG = {
  // The Google Apps Script web app that saves answers to the Sheet. See README.md.
  // Empty this to try the site without saving anything. A note on the page will say so.
  sheetEndpoint: 'https://script.google.com/macros/s/AKfycbzjkQ9PHmQscrOWDeFPIZpCUWdG-BeyDNkZgFg_LPoAs_ValDsJT14IaN3XkF2P-Lcj/exec',

  pageTitle: 'Friends of Figma Adelaide',
  progress: 'Question {n} of {total}',

  // {name} becomes the first word of what they typed in the first question.
  // Options show as chips. Add layout: 'list' to stack them, which suits a scale or options with hints.
  questions: [
    {
      id: 'name',
      type: 'text',
      title: 'Help shape our next meetup. What’s your name?',
      hint: 'Four quick questions. About a minute.',
      placeholder: 'Your name',
      autocomplete: 'name',
      maxLength: 80,
      error: 'Enter your name to continue.',
    },
    {
      id: 'role',
      type: 'single',
      title: 'Nice to meet you, {name}. What do you do?',
      hint: 'Choose the closest match.',
      options: ['Designer', 'Developer', 'Copywriter', 'Content', 'Marketing', 'Product manager', 'Researcher', 'Student'],
      other: { label: 'Something else', fieldLabel: 'What do you do?', maxLength: 80, error: 'Tell us what you do, or choose another option.' },
      error: 'Choose an option to continue.',
    },
    {
      id: 'experience',
      type: 'single',
      layout: 'list',
      title: 'How well do you know Figma?',
      options: [
        { label: 'Just starting out', hint: 'I’ve poked around' },
        { label: 'Getting comfortable', hint: 'I use it now and then' },
        { label: 'Confident', hint: 'It’s part of my week' },
        { label: 'Expert', hint: 'I dream in auto layout' },
      ],
      error: 'Choose an option to continue.',
    },
    {
      id: 'wants',
      type: 'multi',
      title: 'What do you want from Friends of Figma?',
      hint: 'Choose one or more.',
      options: [
        'Meet people',
        'Learn Figma skills',
        'Hands-on workshops',
        'Inspiring talks',
        'Design systems',
        'AI and new tools',
        'Career mentoring',
        'Feedback on my work',
        'Find work or collaborators',
      ],
      other: { label: 'Something else', fieldLabel: 'What would you like?', rows: 4, maxLength: 1000, error: 'Tell us what you’d like, or untick Something else.' },
      error: 'Choose at least one option to send your ideas.',
    },
  ],

  next: 'Next',
  back: 'Back',
  submit: 'Send my ideas',
  sending: 'Sending…',

  sendErrors: {
    offline: 'You’re offline. Check your connection, then send again. Your answers are still here.',
    timeout: 'That took too long. Send again. Your answers are still here.',
    failed: 'We couldn’t save your answers. Send again. Your answers are still here.',
  },

  motion: { pause: 'Pause animation', play: 'Play animation' },

  thanks: {
    tag: 'All done',
    word: 'Thanks, {name}!',
    title: 'Your ideas are in.',
    body: 'We’ll use them to plan future Friends of Figma events in Adelaide. See you at the next one.',
    hint: 'Now throw some stickers around.',
    pageTitle: 'Thanks',
  },
};
