import { PatchEvent, set, unset, useFormCallbacks } from 'sanity';
import type { BooleanInputProps } from 'sanity';

/**
 * 主打開關：開啟時寫入 heroSpotlightActivatedAt（ISO），關閉時清除。
 * 前台依此時間新→舊排序，最近開啟者為第一順位。
 *
 * 欄位層的 onChange 會自動 prefix 目前欄位名，不可再寫 set(false, ['heroSpotlight'])，
 * 否則會變成 heroSpotlight.heroSpotlight，勾選無法取消。改為對文件根送出 PatchEvent。
 */
export function HeroSpotlightToggle(props: BooleanInputProps) {
  const { value, elementProps, readOnly } = props;
  const { onChange: patchDocument } = useFormCallbacks();
  const checked = Boolean(value);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          cursor: readOnly ? 'default' : 'pointer',
          fontSize: '0.875rem'
        }}
      >
        <input
          type="checkbox"
          {...elementProps}
          checked={checked}
          disabled={readOnly}
          onChange={(e) => {
            if (readOnly) return;
            const next = e.currentTarget.checked;
            patchDocument(
              PatchEvent.from(
                next
                  ? [
                      set(true, ['heroSpotlight']),
                      set(new Date().toISOString(), ['heroSpotlightActivatedAt'])
                    ]
                  : [set(false, ['heroSpotlight']), unset(['heroSpotlightActivatedAt'])]
              )
            );
          }}
        />
        <span>設為首頁主打商品</span>
      </label>
      <p style={{ margin: 0, fontSize: '0.75rem', color: '#6e7683', lineHeight: 1.45 }}>
        最近開啟排在最前；首頁只顯示最近 3 筆。若已開滿 3
        筆，請關閉較舊的再開新主打。
      </p>
    </div>
  );
}
