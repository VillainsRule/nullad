interface Error { error: string }
interface Success { link?: string, text?: string }

const doLogs = process.env.NODE_ENV !== 'production';

const bypass = async (inputLink: string): Promise<Success | Error> => {
    try {
        const link = new URL(inputLink);
        const userId = link.pathname.split('/')[1];
        const hash = link.searchParams.get('r');
        const urlBit = link.pathname.split('/')[2];

        const linkIdentificationInput = {
            userIdAndHash: hash ? {
                user_id: userId,
                hash: hash,
                originates_from_adfly: false,
                version: '2'
            } : undefined,
            userIdAndUrl: !hash ? {
                user_id: userId,
                url: urlBit
            } : undefined
        }

        const userTokenReq = await fetch('https://publisher.linkvertise.com/api/v1/account?X-Linkvertise-UT=', {
            headers: {
                'accept': 'application/json',
                'accept-language': 'en-US,en;q=0.9',
                'content-type': 'application/json',
                'referrer': 'https://linkvertise.com/'
            },
            proxy: process.env.PROCCY
        });

        const userTokenRes = await userTokenReq.json();
        const userToken = userTokenRes.user_token;

        if (doLogs) console.log('obtained user token:', userToken);

        const accessTokenReq = await fetch('https://publisher.linkvertise.com/graphql?X-Linkvertise-UT=' + userToken, {
            headers: {
                'accept': 'application/json',
                'accept-language': 'en-US,en;q=0.9',
                'content-type': 'application/json',
                'Referer': 'https://linkvertise.com/'
            },
            body: JSON.stringify({
                operationName: 'getDetailPageContent',
                variables: {
                    linkIdentificationInput,
                    origin: 'sharing',
                    additional_data: {
                        taboola: {
                            external_referrer: '',
                            user_id: crypto.randomUUID(),
                            url: link.toString(),
                            test_group: 'old',
                            session_id: null
                        }
                    }
                },
                query: 'mutation getDetailPageContent($linkIdentificationInput: PublicLinkIdentificationInput!, $origin: String, $additional_data: CustomAdOfferProviderAdditionalData!) {\n  getDetailPageContent(\n    linkIdentificationInput: $linkIdentificationInput\n    origin: $origin\n    additional_data: $additional_data\n  ) {\n    access_token\n    payload_bag {\n      taboola {\n        session_id\n        __typename\n      }\n      __typename\n    }\n    premium_subscription_active\n    link {\n      id\n      video_url\n      recently_edited\n      description\n      url\n      target_type\n      seo_faqs {\n        body\n        title\n        __typename\n      }\n      seo_classification\n      target_host\n      last_edit_at\n      link_images\n      title\n      view_count\n      is_trending\n      recently_edited\n      seo_faqs {\n        title\n        body\n        __typename\n      }\n      percentage_rating\n      is_premium_only_link\n      publisher {\n        id\n        name\n        subscriber_count\n        __typename\n      }\n      positive_rating\n      negative_rating\n      already_rated_by_user\n      user_rating\n      __typename\n    }\n    linkCustomAdOffers {\n      title\n      call_to_action\n      description\n      countdown\n      completion_token\n      provider\n      provider_additional_payload {\n        taboola {\n          available_event_url\n          visible_event_url\n          __typename\n        }\n        __typename\n      }\n      media {\n        type\n        ... on UrlMediaResource {\n          content_type\n          resource_url\n          __typename\n        }\n        __typename\n      }\n      clickout_action {\n        type\n        ... on CustomAdOfferClickoutUrlAction {\n          type\n          clickout_url\n          __typename\n        }\n        __typename\n      }\n      __typename\n    }\n    link_recommendations {\n      target_host\n      target_type\n      id\n      url\n      publisher {\n        id\n        name\n        __typename\n      }\n      last_edit_at\n      link_images\n      title\n      view_count\n      is_trending\n      recently_edited\n      percentage_rating\n      publisher {\n        name\n        __typename\n      }\n      __typename\n    }\n    target_access_information {\n      remaining_waiting_time\n      __typename\n    }\n    __typename\n  }\n}'
            }),
            method: 'POST',
            proxy: process.env.PROCCY
        });

        const accessTokenRes = await accessTokenReq.json();
        const accessToken = accessTokenRes.data.getDetailPageContent.access_token;

        if (doLogs) console.log('obtained access token:', accessToken);

        const tokenReq = await fetch('https://publisher.linkvertise.com/graphql?X-Linkvertise-UT=' + userToken, {
            headers: {
                'accept': 'application/json',
                'accept-language': 'en-US,en;q=0.9',
                'content-type': 'application/json',
                'Referer': 'https://linkvertise.com/'
            },
            body: JSON.stringify({
                operationName: 'completeDetailPageContent',
                variables: {
                    linkIdentificationInput,
                    completeDetailPageContentInput: {
                        access_token: accessToken
                    }
                },
                query: 'mutation completeDetailPageContent($linkIdentificationInput: PublicLinkIdentificationInput!, $completeDetailPageContentInput: CompleteDetailPageContentInput!) {\n  completeDetailPageContent(\n    linkIdentificationInput: $linkIdentificationInput\n    completeDetailPageContentInput: $completeDetailPageContentInput\n  ) {\n    CUSTOM_AD_STEP\n    TARGET\n    additional_target_access_information {\n      remaining_waiting_time\n      can_not_access\n      should_show_ads\n      has_long_paywall_duration\n      __typename\n    }\n    feedback_token\n    __typename\n  }\n}'
            }),
            method: 'POST',
            proxy: process.env.PROCCY
        });

        const tokenRes = await tokenReq.json();
        const token = tokenRes.data.completeDetailPageContent.TARGET;

        const moreAccessInfo = tokenRes.data.completeDetailPageContent.additional_target_access_information;
        if (moreAccessInfo.has_long_paywall_duration) return { error: 'our proxies hit the long paywall, try again' };
        if (moreAccessInfo.can_not_access) return { error: 'our proxies cannot access this url (maybe try again)' };

        if (doLogs) console.log('obtained target token, heres moreAccessInfo', moreAccessInfo);

        const waitTimeout = moreAccessInfo.remaining_waiting_time;

        await new Promise(resolve => setTimeout(resolve, (waitTimeout + 1) * 900));

        if (doLogs) console.log('waited', waitTimeout + 1, 'intervals, proceeding to final request');

        const finalReq = await fetch('https://publisher.linkvertise.com/graphql?X-Linkvertise-UT=' + userToken, {
            headers: {
                'accept': 'application/json',
                'accept-language': 'en-US,en;q=0.9',
                'content-type': 'application/json',
                'priority': 'u=1, i',
                'referrer': 'https://linkvertise.com/',
                'referrerPolicy': 'origin-when-cross-origin'
            },
            body: JSON.stringify({
                operationName: 'getDetailPageTarget',
                variables: {
                    linkIdentificationInput,
                    token: token,
                    action_id: '2cd2d491-6580-4193-b12c-da5e6fa50d131dd4adab-2c98-49bd-9dc6-93ab180fdb92e00e4283-5d5c-4a35-80b2-c2fa'
                },
                query: 'mutation getDetailPageTarget($linkIdentificationInput: PublicLinkIdentificationInput!, $token: String!, $action_id: String) {\n  getDetailPageTarget(\n    linkIdentificationInput: $linkIdentificationInput\n    token: $token\n    action_id: $action_id\n  ) {\n    type\n    url\n    paste\n    __typename\n  }\n}'
            }),
            method: 'POST',
            proxy: process.env.PROCCY
        });

        const res = await finalReq.json().catch(async () => console.log('final fetch json error', await finalReq.clone().text()));

        if (doLogs) console.log('final request response:', res);

        if (res.error || res.errors) {
            console.error('error occurred:', res.error || res.errors);
            return { error: 'unknown_error' };
        } else {
            const finalURL = res.data.getDetailPageTarget.url;
            const finalText = res.data.getDetailPageTarget.paste;

            return { link: finalURL, text: finalText };
        }
    } catch (e) {
        console.error(e);
        return { error: 'unknown_error' };
    }
}

export default bypass;