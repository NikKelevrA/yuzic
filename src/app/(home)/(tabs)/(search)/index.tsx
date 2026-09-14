import Search from "@/features/search/SearchScreen";
import { SearchProvider } from "@/features/search/SearchContext";

export default function SearchScreen() {
  return (
    <SearchProvider>
      <Search />
    </SearchProvider>
  );
}
