'use client';

import useSWR from 'swr';
import { useMemo } from 'react';
import { getExchangeRatesAction } from '@/actions/currency';
import { CurrencyConverter } from '@/utils/currency-math';

export function useCurrencyConverter() {
  const { data: rates = [], isLoading } = useSWR(
    'exchange-rates',
    getExchangeRatesAction,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 300000,
    },
  );

  const converter = useMemo(() => new CurrencyConverter(rates), [rates]);

  const convert = useMemo(
    () =>
      (amount: number, from: string, to = 'USD') =>
        converter.convert(amount, from, to),
    [converter],
  );

  return { convert, converter, isLoading };
}
