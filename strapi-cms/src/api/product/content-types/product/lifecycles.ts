function setHeroSpotlightTimestamp(data: Record<string, unknown>) {
  if (data.heroSpotlight === true) {
    data.heroSpotlightActivatedAt = new Date().toISOString();
  } else if (data.heroSpotlight === false) {
    data.heroSpotlightActivatedAt = null;
  }
}

const SLUG_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const SLUG_LEN = 5;

function randomSlug(): string {
  return Array.from({ length: SLUG_LEN }, () => SLUG_ALPHABET[Math.floor(Math.random() * SLUG_ALPHABET.length)]).join('');
}

async function assignProductSlugIfMissing(data: Record<string, unknown>) {
  const current = typeof data.slug === 'string' ? data.slug.trim() : '';
  if (current) return;

  for (let i = 0; i < 20; i += 1) {
    const candidate = randomSlug();
    const exists = await strapi.db.query('api::product.product').findOne({
      where: { slug: candidate },
      select: ['id']
    });
    if (!exists) {
      data.slug = candidate;
      return;
    }
  }
  data.slug = `${randomSlug()}${Date.now().toString(36).slice(-2)}`;
}

export default {
  async beforeCreate(event: { params: { data: Record<string, unknown> } }) {
    await assignProductSlugIfMissing(event.params.data);
    setHeroSpotlightTimestamp(event.params.data);
  },
  beforeUpdate(event: { params: { data: Record<string, unknown> } }) {
    if (Object.prototype.hasOwnProperty.call(event.params.data, 'heroSpotlight')) {
      setHeroSpotlightTimestamp(event.params.data);
    }
  }
};
