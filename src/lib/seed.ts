import type { AppData, Settings } from './types.ts'

export const CHART_PALETTE = [
  '#0D9488', '#6366F1', '#F59E0B', '#F43F5E', '#10B981', '#8B5CF6',
  '#0EA5E9', '#F97316', '#EC4899', '#84CC16', '#06B6D4', '#A16207',
]

export function defaultSettings(): Settings {
  return {
    theme: 'system',
    thresholdNotifs: true,
    reminders: {
      morningBrief: { enabled: true, time: '09:00' },
      eveningBrief: { enabled: true, time: '21:00' },
      checkinMorning: { enabled: true, time: '09:00' },
      checkinAfternoon: { enabled: true, time: '15:00' },
      checkinEvening: { enabled: true, time: '18:00' },
      checkinNight: { enabled: true, time: '22:00' },
    },
    firedKeys: {},
  }
}

export function seedData(): AppData {
  return {
    schema: 1,
    accounts: [
      { id: 'acc-wise', name: 'Wise', type: 'Multi-currency', currency: 'THB', fxRateToTHB: 1, icon: '🌐', color: '#0EA5E9' },
      { id: 'acc-kbank', name: 'KPlus (KBank)', type: 'Bank', currency: 'THB', fxRateToTHB: 1, icon: '🏦', color: '#10B981' },
      { id: 'acc-tmn', name: 'TrueMoney Wallet', type: 'E-wallet', currency: 'THB', fxRateToTHB: 1, icon: '📱', color: '#F97316' },
    ],
    incomeSources: [
      { id: 'src-salary', name: 'Salary' },
      { id: 'src-freelance', name: 'Freelance' },
    ],
    categories: [
      { id: 'cat-rent', name: 'Rent', icon: '🏠', color: '#0D9488' },
      { id: 'cat-utilities', name: 'Electricity / Utilities', icon: '💡', color: '#6366F1' },
      { id: 'cat-food', name: 'Daily Meals & Food', icon: '🍜', color: '#F59E0B' },
      { id: 'cat-visa', name: 'Visa Fees', icon: '🛂', color: '#F43F5E' },
      { id: 'cat-travel', name: 'Travel', icon: '✈️', color: '#10B981' },
      { id: 'cat-fun', name: 'Fun Activities', icon: '🎉', color: '#8B5CF6' },
      { id: 'cat-donations', name: 'Donations', icon: '🙏', color: '#0EA5E9' },
      { id: 'cat-baydin', name: 'Bay-din / Tarot', icon: '🔮', color: '#F97316' },
      { id: 'cat-treats', name: 'Friends-Treats', icon: '🍻', color: '#EC4899' },
      { id: 'cat-mom', name: 'Mom Medicine Support', icon: '💊', color: '#84CC16' },
      { id: 'cat-reward', name: 'Self-Rewarding', icon: '🎁', color: '#06B6D4' },
      { id: 'cat-misc', name: 'Personal / Misc', icon: '🧺', color: '#A16207' },
    ],
    funds: [
      { id: 'fund-education', name: 'Education', icon: '🎓', color: '#4F46E5' },
      { id: 'fund-visa', name: 'Visa', icon: '🛂', color: '#0EA5E9' },
    ],
    heldParties: [{ id: 'aunt', name: 'Aunt', isPrimary: true }],
    transactions: [],
    budgets: { perCategory: {} },
    settings: defaultSettings(),
  }
}
