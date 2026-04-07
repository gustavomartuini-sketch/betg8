export interface PolymarketToken {
  token_id: string;
  outcome: string;
  price: number;
  winner: boolean;
}

export interface PolymarketMarket {
  condition_id: string;
  question_id: string;
  question: string;
  description: string;
  market_slug: string;
  end_date_iso: string;
  game_start_time: string | null;
  seconds_delay: number;
  fpmm: string;
  maker_base_fee: number;
  taker_base_fee: number;
  notifications_enabled: boolean;
  neg_risk: boolean;
  neg_risk_market_id: string;
  neg_risk_request_id: string;
  icon: string;
  image: string;
  rewards: {
    min_size: number;
    max_spread: number;
    event_start_date: string;
    event_end_date: string;
    in_game_multiplier: number;
    reward_epoch: number;
  };
  is_50_50_market: boolean;
  tokens: PolymarketToken[];
  tags: string[];
  enable_order_book: boolean;
  active: boolean;
  closed: boolean;
  archived: boolean;
  accepting_orders: boolean;
  accepting_order_timestamp: string | null;
  minimum_order_size: number;
  minimum_tick_size: number;
  category: string;
  groupItemTitle: string;
  groupItemThreshold: number;
  questionID: string;
  volume: number;
  volumeNum: number;
  liquidity: number;
  liquidityNum: number;
  endDate: string;
  startDate: string;
  hasReviewedDates: boolean;
  ready: boolean;
  funded: boolean;
  umaResolutionStatuses: string;
  resolvedBy: string;
  restricted: boolean;
  pagerDutyNotificationEnabled: boolean;
  clobRewards: unknown[];
}

export interface EnrichedMarket extends PolymarketMarket {
  yesPrice: number;
  noPrice: number;
  yesTokenId: string;
  noTokenId: string;
  category_label: string;
  hindi_question?: string;
}

export interface OrderPayload {
  tokenId: string;
  side: 'BUY' | 'SELL';
  price: number;
  size: number;
  funder: string;
}

export interface BuilderConfig {
  builderAddress: string;
  builderFee: number;
}

export type Language = 'en' | 'hi';

export type TabCategory = 'cricket' | 'ipl' | 'politics' | 'crypto' | 'all';
