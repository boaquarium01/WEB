/** GROQ projections / queries for existing Sanity `product` + `category` docs. */

export const PRODUCT_PROJECTION = /* groq */ `
  _id,
  _createdAt,
  _type,
  name,
  "slug": slug.current,
  "category": category->{
    _id,
    name,
    "slug": slug.current
  },
  excerpt,
  body,
  enabled,
  sortOrder,
  featured,
  featuredSortOrder,
  heroSpotlight,
  heroSpotlightActivatedAt,
  image,
  gallery,
  specificationsEnabled,
  specifications[]{ _key, name, order, options[]{ _key, name, order, image } },
  option1Name,
  option2Name,
  variants[]{ _key, optionIds, option1Value, option2Value, image },
  seoTitle,
  seoKeywords,
  seoDescription
`;

export const ALL_PRODUCTS_QUERY = /* groq */ `
  *[_type == "product" && defined(slug.current)] | order(sortOrder asc, name asc) {
    ${PRODUCT_PROJECTION}
  }
`;

export const PRODUCT_BY_SLUG_QUERY = /* groq */ `
  *[_type == "product" && slug.current == $slug][0] {
    ${PRODUCT_PROJECTION}
  }
`;

export const PRODUCT_BY_ID_QUERY = /* groq */ `
  *[_type == "product" && _id == $id][0] {
    ${PRODUCT_PROJECTION}
  }
`;

export const ALL_CATEGORIES_QUERY = /* groq */ `
  *[_type == "category"] | order(orderRank asc, sortOrder asc, name asc) {
    _id,
    name,
    "slug": slug.current
  }
`;

export const FEATURED_PRODUCTS_QUERY = /* groq */ `
  *[_type == "product" && defined(slug.current) && featured == true && enabled != false]
    | order(defined(featuredSortOrder) desc, coalesce(featuredSortOrder, sortOrder) asc, name asc) {
    ${PRODUCT_PROJECTION}
  }
`;

export const HERO_SPOTLIGHT_PRODUCTS_QUERY = /* groq */ `
  *[_type == "product" && defined(slug.current) && heroSpotlight == true && enabled != false]
    | order(coalesce(heroSpotlightActivatedAt, _updatedAt) desc) [0...3] {
    ${PRODUCT_PROJECTION}
  }
`;
