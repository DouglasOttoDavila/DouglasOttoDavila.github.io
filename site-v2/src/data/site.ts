export const site = {
  name: "Douglas D'Avila",
  role: 'Software Development Engineer in Test',
  shortRole: 'SDET',
  email: 'douglas.odavila@gmail.com',
  location: 'Porto Alegre, Brazil',
  timezone: 'BRT / UTC-3',
  linkedin: 'https://www.linkedin.com/in/douglasottodavila',
  github: 'https://github.com/DouglasOttoDavila',
  calendar: 'https://calendar.app.google/JSDyNwJrwZkNpM9E9',
  resume: '/documents/douglas-davila-resume.pdf'
} as const;

export const navigation = [
  { href: '/work', label: 'Work' },
  { href: '/experience', label: 'Experience' },
  { href: '/writing', label: 'Writing' },
  { href: '/lab', label: 'Lab' },
  { href: '/about', label: 'About' }
] as const;
