import { useQuery } from '@tanstack/react-query';
import marketTrendsService from '../services/marketTrendsService';

export const MARKET_TRENDS_QUERY_KEY = ['marketTrendsInit'];

/**
 * Inicialización compartida del servicio de tendencias de mercado.
 *
 * Todas las páginas usan la misma query key, así que el scrape de
 * futbolfantasy corre como mucho una vez por staleTime en toda la app
 * (el servicio además comparte la promesa en vuelo entre montajes
 * concurrentes). `trendsReady` solo es true cuando hay datos utilizables
 * en la caché, no simplemente cuando la inicialización terminó.
 */
const useMarketTrends = () => {
    const query = useQuery({
        queryKey: MARKET_TRENDS_QUERY_KEY,
        queryFn: () => marketTrendsService.initialize(),
        staleTime: 60 * 60 * 1000, // 1 hora — los datos scrapeados cambian ~a diario
        gcTime: 24 * 60 * 60 * 1000,
    });

    const result = query.data;
    const trendsReady = Boolean(
        (result?.success || result?.fromCache || result?.playersCount > 0) &&
        marketTrendsService.marketValuesCache?.size > 0
    );

    return { ...query, trendsResult: result, trendsReady };
};

export default useMarketTrends;
